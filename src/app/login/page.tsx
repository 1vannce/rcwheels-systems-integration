import type { Metadata } from "next"
import Image from "next/image"

import magsWallpeper from "@/assets/magswallpaper.jpg"
import wordmark from "@/assets/ubecmags-wordmark.png"
import { LoginForm } from "@/components/login-form"
import { brand } from "@/lib/brand"

export const metadata: Metadata = { title: "Sign in" }

export default function LoginPage() {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex flex-col gap-2">
          <Image src={wordmark} alt={brand.name} priority className="h-11 w-auto self-start" />
          <span className="text-xs text-muted-foreground">{brand.tagline}</span>
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-sm">
            <LoginForm />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Academic prototype. Accounts and data are fictional.
        </p>
      </div>
      <div className="relative hidden border-l-4 border-signal bg-muted lg:block">
        <Image
          src={magsWallpeper}
          alt=""
          fill
          sizes="(min-width: 1024px) 55vw, 100vw"
          className="object-cover dark:brightness-[0.35] dark:grayscale"
        />
      </div>
    </div>
  )
}
