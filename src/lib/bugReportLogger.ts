export interface ConsoleLogEntry {
  timestamp: string;
  level: 'log' | 'warn' | 'error';
  message: string;
}

export interface NetworkLogEntry {
  timestamp: string;
  method: string;
  url: string;
  status: number | null;
  duration: number;
}

const consoleLogs: ConsoleLogEntry[] = [];
const networkLogs: NetworkLogEntry[] = [];
const MAX_CONSOLE = 50;
const MAX_NETWORK = 30;

let interceptorsInstalled = false;
let originalConsoleLog: typeof console.log;
let originalConsoleWarn: typeof console.warn;
let originalConsoleError: typeof console.error;
let originalFetch: typeof fetch;

function safeStringify(args: unknown[]): string {
  try {
    return args
      .map(a => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ')
      .slice(0, 500);
  } catch {
    return String(args[0]).slice(0, 500);
  }
}

function pushConsole(level: ConsoleLogEntry['level'], args: unknown[]) {
  if (consoleLogs.length >= MAX_CONSOLE) consoleLogs.shift();
  consoleLogs.push({ timestamp: new Date().toISOString(), level, message: safeStringify(args) });
}

export function installInterceptors() {
  if (typeof window === 'undefined') return;
  if (interceptorsInstalled) return;

  originalConsoleLog = console.log;
  originalConsoleWarn = console.warn;
  originalConsoleError = console.error;
  originalFetch = window.fetch;

  console.log = (...args: unknown[]) => { pushConsole('log', args); originalConsoleLog(...args); };
  console.warn = (...args: unknown[]) => { pushConsole('warn', args); originalConsoleWarn(...args); };
  console.error = (...args: unknown[]) => { pushConsole('error', args); originalConsoleError(...args); };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    if (url.includes('/api/bugs/report')) return originalFetch(input, init);

    const method = init?.method?.toUpperCase() || 'GET';
    const pathname = url.startsWith('http') ? new URL(url).pathname : url;
    const start = Date.now();
    let status: number | null = null;
    try {
      const res = await originalFetch(input, init);
      status = res.status;
      return res;
    } catch (err) {
      throw err;
    } finally {
      const duration = Date.now() - start;
      if (networkLogs.length >= MAX_NETWORK) networkLogs.shift();
      networkLogs.push({ timestamp: new Date().toISOString(), method, url: pathname, status, duration });
    }
  };

  interceptorsInstalled = true;
}

export function removeInterceptors() {
  if (typeof window === 'undefined') return;
  if (!interceptorsInstalled) return;

  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
  window.fetch = originalFetch;
  interceptorsInstalled = false;
}

export function getConsoleLogs(): ConsoleLogEntry[] {
  return [...consoleLogs];
}

export function getNetworkLogs(): NetworkLogEntry[] {
  return [...networkLogs];
}
