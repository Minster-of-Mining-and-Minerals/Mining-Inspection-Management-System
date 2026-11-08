"use client";

import { useState } from "react";
import { Copy, Check, KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  /** The one-time password to show; the dialog is open while this is set. */
  password: string | null;
  email?: string;
  onClose: () => void;
}

/**
 * Shown when a new account (or a password reset) could not be emailed.
 * The password is displayed once and is not stored anywhere in the browser.
 */
export function TemporaryPasswordDialog({ password, email, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the password is still visible to copy by hand */
    }
  };

  return (
    <Dialog open={!!password} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-golden-deep" />
            Temporary password
          </DialogTitle>
          <DialogDescription>
            The email could not be sent{email ? ` to ${email}` : ""}. Give this password to the user in person. It is
            shown only once, and they must change it when they first sign in.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <code className="flex-1 select-all break-all font-mono text-lg tracking-wider text-primary">{password}</code>
          <Button type="button" variant="outline" size="sm" onClick={copy} className="shrink-0 gap-1">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
