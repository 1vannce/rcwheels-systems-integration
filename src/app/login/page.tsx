import type { Metadata } from "next"
import Image from "next/image"

import magsWallpeper from "@/assets/magswallpaper.jpg"
import ubecmagsLogo from "@/assets/ubecmags.jpg"
import { LoginForm } from "@/components/login-form"

export const metadata: Metadata = { title: "Sign in | RCWheels" }

export default function LoginPage() {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center overflow-hidden rounded-sm bg-primary">
            <Image
              src={ubecmagsLogo}
              alt=""
              className="size-full object-cover"
            />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-lg font-semibold [font-stretch:85%]">RCWheels</span>
            <span className="text-xs text-muted-foreground">
              Stockroom and requisitions
            </span>
          </div>
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
