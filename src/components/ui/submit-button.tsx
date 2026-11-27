"use client"

import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"

// A submit button that disables itself while its form's action is running.
// A caller's `disabled` adds to that check and never replaces it.
function SubmitButton({
  children,
  disabled,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" {...props} disabled={pending || disabled}>
      {children}
    </Button>
  )
}

export { SubmitButton }
