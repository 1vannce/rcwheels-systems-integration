// Shows the result a server action returned to its form.
function FormMessage({
  result,
}: {
  result: { ok: true; message?: string } | { ok: false; error: string } | null
}) {
  if (!result) {
    return null
  }

  if (!result.ok) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {result.error}
      </p>
    )
  }

  return result.message ? (
    <p role="status" className="text-sm text-muted-foreground">
      {result.message}
    </p>
  ) : null
}

export { FormMessage }
