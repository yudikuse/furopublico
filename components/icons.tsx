import type { SVGProps } from "react";

function IconBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return <IconBase {...props}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></IconBase>;
}

export function FileIcon(props: SVGProps<SVGSVGElement>) {
  return <IconBase {...props}><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></IconBase>;
}

export function ArrowIcon(props: SVGProps<SVGSVGElement>) {
  return <IconBase {...props}><path d="M5 12h14M14 7l5 5-5 5"/></IconBase>;
}

export function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return <IconBase {...props}><path d="M12 3 5 6v5c0 4.5 2.8 8.5 7 10 4.2-1.5 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/></IconBase>;
}

export function AlertIcon(props: SVGProps<SVGSVGElement>) {
  return <IconBase {...props}><path d="M12 4 3 20h18z"/><path d="M12 9v5M12 17h.01"/></IconBase>;
}

export function MoneyIcon(props: SVGProps<SVGSVGElement>) {
  return <IconBase {...props}><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 9h.01M17 15h.01"/></IconBase>;
}

export function VoteIcon(props: SVGProps<SVGSVGElement>) {
  return <IconBase {...props}><path d="m8 4 4 4 4-4"/><path d="M5 10h14l-1 10H6z"/><path d="M12 8v7"/></IconBase>;
}

export function LinkIcon(props: SVGProps<SVGSVGElement>) {
  return <IconBase {...props}><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></IconBase>;
}

export function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return <IconBase {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></IconBase>;
}
