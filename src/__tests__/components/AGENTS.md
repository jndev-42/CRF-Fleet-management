<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Component Tests

## Purpose
React component tests using React Testing Library. Tests UI behavior, user interactions, prop handling, and state management in React components. **Never mocks the database** — focus on component-level behavior and user workflows.

## Key Files
| File | Description |
|------|-------------|
| `FunFactor.test.tsx` | Tests fun-factor score display and calculation logic |
| `VehicleCalendar.test.tsx` | Tests vehicle calendar view with availability, reservations, and navigation |
| `CommunicationBanner.test.tsx` | Tests announcement banner display and dismissal |
| `PhotoPicker.test.tsx` | Tests photo selection, upload, compression, and retry logic |
| `IncidentReportModal.test.tsx` | Tests incident form submission, validation, and field handling |
| `BugReportModal.test.tsx` | Tests bug report form, screenshot capture, and submission |
| `EditVehicleModal.test.tsx` | Tests vehicle edit form, field updates, and save confirmation |

## For AI Agents

### Working In This Directory
- Tests use React Testing Library (`render`, `screen`, `userEvent`, `waitFor`)
- Import components directly; no database mocking needed (auth and external services mocked at setup)
- Use `screen.getByRole()`, `screen.getByLabelText()`, `screen.getByText()` for assertions
- Interact via `userEvent.click()`, `userEvent.type()`, `userEvent.selectOptions()`, etc.
- Async operations should use `waitFor()` or `userEvent.setup().then()`
- Tests verify: correct rendering, user interactions, form submission, error states, edge cases
- Component tests do not need a real database — integrate with API mocks instead

### Test Pattern
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComponentName } from '@/components/...';

it('should render and handle user interaction', async () => {
  const user = userEvent.setup();
  render(<ComponentName prop="value" />);
  
  expect(screen.getByText('Expected label')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /submit/i }));
  
  expect(screen.getByText('Success message')).toBeInTheDocument();
});
```

### Coverage Priority
1. Happy path — component renders and responds to user interaction
2. Form validation — required fields, error messages
3. Loading/error states — async data fetching, fallbacks
4. Edge cases — empty data, missing props, disabled states
5. Accessibility — labels, roles, keyboard navigation

## Dependencies

### Internal
- React components from `src/components/` (tested component itself)
- Mocked auth via `@/auth` (setup by test framework)
- Mocked external services: `@/lib/renault`, `@/lib/onesignal`, `@/lib/drive` (setup by test framework)
- React Testing Library utilities and user event helpers

