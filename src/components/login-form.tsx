"use client"

import { useActionState } from "react"

import { cn } from "cn"

import { FormMessage } from "@/components/ui/form-message"
import { SubmitButton } from "@/components/ui/submit-button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { signInAction } from "@/modules/core/actions/auth.actions"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  // `useActionState` keeps the last ActionResult returned by the server action
  // so validation and credential errors can be shown without a full reload.
  const [result, formAction] = useActionState(signInAction, null)

  return (
    <form
      action={formAction}
      className={cn("flex flex-col gap-6", className)}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[1.75rem] font-semibold leading-tight">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Use the work email and password the system administrator gave you.
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="email">Work email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="name@rcwheels.test"
            autoComplete="username"
            className="h-9"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="h-9"
            required
          />
          <FieldDescription>
            Forgot it? Ask the system administrator to reset your password.
          </FieldDescription>
        </Field>
        <FormMessage result={result} />
        <Field>
          <SubmitButton size="lg" className="w-full">
            Sign in
          </SubmitButton>
        </Field>
      </FieldGroup>
    </form>
  )
}
