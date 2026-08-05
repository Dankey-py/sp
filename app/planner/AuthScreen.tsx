import { useState, type FormEvent } from "react";

import { apiRequest } from "./api";


type AuthResult = {
  token: string;
  user: { id: number; name: string; email: string };
};

type AuthMode = "login" | "signup" | "reset";

export function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (token: string) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    setNotice(null);
    setPassword("");
    setPasswordConfirmation("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === "signup" && password !== passwordConfirmation) {
      setError("Passwords do not match. Enter the same password twice.");
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "reset") {
        await apiRequest<null>("/api/auth/reset-password", {
          method: "POST",
          body: { email, newPassword: password },
        });
        setNotice("Password updated. Sign in with your new password.");
        setMode("login");
        setPassword("");
        return;
      }

      const result = await apiRequest<AuthResult>(
        mode === "signup" ? "/api/auth/signup" : "/api/auth/login",
        {
          method: "POST",
          body: mode === "signup" ? { name, email, password } : { email, password },
        },
      );
      onAuthenticated(result.token);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to connect to the Study Planner backend.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="brand brand-light">
          <span className="brand-mark">S</span>
          <span>StudyOS</span>
        </div>
        <div className="auth-copy">
          <p className="eyebrow eyebrow-light">My IB study planner</p>
          <h1>Keep the school work in one simple place.</h1>
          <p>
            I made this page because deadlines can become messy very fast. Put the
            subjects, tasks, real study time and Kimi help here, then check what is
            actually important now.
          </p>
        </div>
        <div className="auth-proof">
          <span>01</span>
          <p>Check the urgent work first</p>
          <span>02</span>
          <p>Save the real time I studied</p>
          <span>03</span>
          <p>Ask Kimi when the next step is not clear</p>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-form-wrap">
          <p className="eyebrow">Account</p>
          <h2>
            {mode === "signup"
              ? "Make a new account"
              : mode === "reset"
                ? "Change the password"
                : "Sign in and open the planner"}
          </h2>
          <p className="muted auth-intro">
            {mode === "reset"
              ? "This school version does not send an email code. Enter the same account email and make a new password here."
              : mode === "signup"
                ? "Make one account first. The subjects, plans and study sessions you add later will all be connected to this account."
                : "Your planner data is saved in the local SQLite database. Sign in and the same subjects, sessions and deadlines will load again."}
          </p>

          <form className="stack-form" onSubmit={handleSubmit}>
            {mode === "signup" ? (
              <label>
                <span>Name</span>
                <small className="field-help">This is the name shown on the overview page. A short name is enough.</small>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Alex Chen"
                  autoComplete="name"
                  required
                />
              </label>
            ) : null}
            <label>
              <span>Email</span>
              <small className="field-help">Use one email you can remember. It is the ID used to find your planner data.</small>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="alex@school.edu"
                autoComplete="email"
                required
              />
            </label>
            <label>
              <span>{mode === "reset" ? "New password" : "Password"}</span>
              <small className="field-help">Eight characters is the minimum. It is only used to protect this account.</small>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
            </label>
            {mode === "signup" ? (
              <label>
                <span>Confirm password</span>
                <small className="field-help">Enter the same password again before creating the account.</small>
                <input
                  type="password"
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                  placeholder="Enter the password again"
                  minLength={8}
                  autoComplete="new-password"
                  aria-invalid={Boolean(passwordConfirmation && password !== passwordConfirmation)}
                  required
                />
              </label>
            ) : null}

            {error ? <p className="form-message form-error">{error}</p> : null}
            {notice ? <p className="form-message form-success">{notice}</p> : null}

            <button className="button button-primary button-full" disabled={submitting}>
              {submitting
                ? "Working…"
                : mode === "signup"
                  ? "Create my account"
                  : mode === "reset"
                    ? "Save the new password"
                    : "Open my planner"}
            </button>
          </form>

          <div className="auth-switches">
            {mode === "login" ? (
              <>
                <button type="button" onClick={() => changeMode("reset")}>I forgot the password</button>
                <p>No account yet? <button type="button" onClick={() => changeMode("signup")}>Make one here</button></p>
              </>
            ) : (
              <p>Already have an account? <button type="button" onClick={() => changeMode("login")}>Go back to sign in</button></p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
