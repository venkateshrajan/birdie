"use client";

import { useActionState } from "react";
import { loginAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LoginState } from "@/lib/admin-types";

const initial: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="password" className="font-bold uppercase tracking-wide">
          Admin password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          required
          className="nb-sm h-12 border-[3px] bg-paper-2 text-base"
        />
      </div>

      {state.error && (
        <p className="nb-sm bg-red px-3 py-2 text-sm font-bold text-paper">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="nb-press h-12 border-[3px] bg-lime text-base font-bold text-ink hover:bg-lime-d"
      >
        {pending ? "Checking…" : "Enter →"}
      </Button>
    </form>
  );
}
