"use client"

import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"

// A submit button that disables itself while its form's action is running.
function SubmitButton({
  children,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending} {...props}>
      {children}
    </Button>
  )
}

export { SubmitButton }
