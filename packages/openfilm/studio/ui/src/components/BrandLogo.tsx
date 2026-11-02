import { PRODUCT } from '../lib/brand';

/** The approved icon's white u3 and amber play triangle, simplified for 11–34 px interface marks. */
export function BrandLogo({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={`block shrink-0 ${className ?? ''}`.trim()} role="img" aria-label={PRODUCT}>
      <rect width="100" height="100" rx="22" fill="#101218" />
      <path d="M20 35V54C20 77 48 77 48 54V38M59 30H73C91 30 91 49 74 49H63V57M76 49C94 54 91 73 73 73H56" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M67 55Q65 54 65 57V65Q65 68 68 66L75 62Q78 60 75 59Z" fill="#FFB020" />
    </svg>
  );
}
