import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/lib/db";

declare module "next-auth" {
    interface Session {
        user: {
            role: "ADMIN" | "USER";
        } & DefaultSession["user"];
    }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
                params: {
                    prompt: "select_account",
                },
            },
        }),
    ],
    pages: {
        signIn: "/login",
        error: "/login",
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isApiAuthRoute = nextUrl.pathname.startsWith('/api/auth');
            const isLoginRoute = nextUrl.pathname === '/login';

            if (isApiAuthRoute) return true;

            if (isLoginRoute) {
                if (isLoggedIn) return Response.redirect(new URL('/', nextUrl));
                return true;
            }

            if (!isLoggedIn) {
                return false; // Redirects to sign-in page
            }

            return true;
        },
        async signIn({ user, profile }) {
            // Check both user object and profile object just in case
            const email = user?.email || profile?.email;
            if (!email) {
                console.error("Sign-in failed: No email provided by Google");
                return "/login?error=AccessDenied";
            }

            console.log("Login attempt with email:", email);

            // Strict restriction to @croix-rouge.fr emails (case insensitive)
            if (email.toLowerCase().endsWith("@croix-rouge.fr")) {
                return true;
            }

            console.log("Rejected email:", email);
            return "/login?error=AccessDenied"; // Explicitly redirect to our custom login page
        },
        async session({ session, token }) {
            // Ensure no unauthorized sessions linger somehow
            const email = session?.user?.email;
            if (!email || !email.toLowerCase().endsWith("@croix-rouge.fr")) {
                // Return invalid session
                return { ...session, error: "Unauthorized" } as any;
            }

            try {
                // Check if user is an admin
                const res = await db.execute({
                    sql: 'SELECT 1 FROM "Admin" WHERE email = ?',
                    args: [email]
                });

                session.user.role = res.rows.length > 0 ? "ADMIN" : "USER";
            } catch (e) {
                console.error("Failed to check admin role:", e);
                session.user.role = "USER";
            }

            return session;
        }
    },
});
