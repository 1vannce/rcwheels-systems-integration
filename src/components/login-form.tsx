"use client"

import { useActionState } from "react"

import { cn } from "cn"

import { FormMessage } from "@/components/ui/form-message"
import { SubmitButton } from "@/components/ui/submit-button"
import {
  Field,
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
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Login to your account</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Enter your email below to login to your account
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="m@example.com"
            autoComplete="username"
            required
          />
        </Field>
        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <a
              href="#"
              className="ml-auto text-sm underline-offset-4 hover:underline"
            >
              Forgot your password?
            </a>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <FormMessage result={result} />
        <Field>
          <SubmitButton className="w-full">Login</SubmitButton>
        </Field>
      </FieldGroup>
    </form>
  )
}
