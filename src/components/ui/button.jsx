import * as React from "react"

import { cn } from "@/lib/utils"

const Button = React.forwardRef(({ className, variant = "default", ...props }, ref) => (
  <button
    className={cn(
      "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      variant === "outline"
        ? "border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground"
        : "bg-primary text-primary-foreground shadow hover:bg-primary/90",
      className,
    )}
    ref={ref}
    {...props}
  />
))
Button.displayName = "Button"

export { Button }
