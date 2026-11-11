"use client";

import { Menu, X } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";

import type { NavigationGroup } from "../types/navigation.type";
import { NavLinks } from "./nav-links";

export function MobileNav({ groups }: { groups: NavigationGroup[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeDialog = () => dialogRef.current?.close();

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Open navigation menu"
        aria-controls="mobile-navigation"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Menu aria-hidden="true" />
      </Button>
      <dialog
        ref={dialogRef}
        id="mobile-navigation"
        aria-labelledby="mobile-navigation-title"
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(20rem,calc(100vw-3rem))] max-w-none border-0 bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeDialog();
          }
        }}
      >
        <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
          <div className="flex items-center justify-between">
            <h2 id="mobile-navigation-title" className="text-lg font-semibold">
              Navigation
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close navigation menu"
              onClick={closeDialog}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <NavLinks groups={groups} onNavigate={closeDialog} />
        </div>
      </dialog>
    </>
  );
}
