"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";

export function PendingButton({
  children,
  pendingLabel,
  className,
  disabled = false,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending || disabled} className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}>
      {pending && <LoaderCircle className="h-4 w-4 animate-spin" />}
      {pending ? pendingLabel : children}
    </button>
  );
}
