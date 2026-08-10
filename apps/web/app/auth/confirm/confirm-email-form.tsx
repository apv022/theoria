"use client";

import { useActionState, useEffect } from "react";
import { confirmEmail } from "./actions";

export function ConfirmEmailForm({
  tokenHash,
  type,
  next,
}: {
  readonly tokenHash: string;
  readonly type: string;
  readonly next: string;
}) {
  const [destination, formAction, pending] = useActionState(confirmEmail, null);

  useEffect(() => {
    if (destination) window.location.assign(destination);
  }, [destination]);

  return (
    <form action={formAction}>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Confirming…" : "Confirm email address"}
      </button>
    </form>
  );
}
