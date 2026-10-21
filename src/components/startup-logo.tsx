import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  logoUrl: string | null;
  size?: "default" | "lg";
  className?: string;
};

export function StartupLogo({ name, logoUrl, size = "default", className }: Props) {
  return (
    <Avatar
      className={cn(
        "rounded-lg after:rounded-lg",
        size === "lg" ? "size-16" : "size-10",
        className
      )}
    >
      {logoUrl && <AvatarImage src={logoUrl} alt="" className="rounded-lg bg-background object-contain" />}
      <AvatarFallback className={cn("rounded-lg font-semibold", size === "lg" && "text-xl")}>
        {name.slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
