import { useServerFn } from '@tanstack/react-start';
import { signOutEverywhereFn } from '@/features/auth/auth.functions';
import { ConfirmButton } from '@/features/shell/ConfirmButton';
import { SectionCard } from '@/features/shell/SectionCard';

/** Ends every browser session; useServerFn follows the server's redirect to /login. */
export function SessionsCard() {
  const signOutEverywhere = useServerFn(signOutEverywhereFn);
  return (
    <SectionCard
      title="Sessions"
      description="Each browser you sign in on stays signed in for 30 days."
      hint="Signs out every browser, this one included. API keys and connected apps keep working."
      actions={
        <ConfirmButton
          title="Sign out everywhere?"
          description="Every browser signed in to XBase is signed out, this one included. Sign in again with X."
          action="Sign out everywhere"
          errorTitle="Couldn’t sign out"
          onConfirm={async () => {
            await signOutEverywhere();
          }}
        >
          Sign out everywhere
        </ConfirmButton>
      }
    />
  );
}
