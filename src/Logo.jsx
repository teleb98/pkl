/**
 * PKL Logo — open book (Library) + golden spark (AI Knowledge)
 *
 * PklMark   : icon only (square with rounded corners)
 * PklWordmark: icon + "PKL" + optional subtitle
 */

export function PklMark({ size = 40, bg = "#C35B2A", light = false }) {
  // light=true → white background, amber book/spark; used on dark surfaces
  const pageFill  = light ? "#C35B2A" : "#FFF8F0";
  const lineFill  = light ? "rgba(255,248,240,0.45)" : "#C35B2A";
  const sparkFill = "#FFD580";
  const spineFill = light ? "rgba(255,248,240,0.25)" : "rgba(195,91,42,0.2)";

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background */}
      <rect width="40" height="40" rx="9" fill={light ? "#FFF8F0" : bg} />

      {/* Left page */}
      <path d="M6 11C6 9.9 6.9 9 8 9H19V31C14.5 30 10 30 6 31.5V11Z" fill={pageFill} opacity={light ? 1 : 0.93} />
      {/* Right page */}
      <path d="M21 9H32C33.1 9 34 9.9 34 11V31.5C29.5 30 25 30 21 31V9Z" fill={light ? "#C35B2A" : "#FFF8F0"} opacity={light ? 0.85 : 1} />
      {/* Spine */}
      <rect x="19" y="9" width="2" height="22" fill={spineFill} />

      {/* Text lines – left page */}
      <rect x="8"  y="14"   width="8" height="1.5" rx=".75" fill={lineFill} opacity=".32" />
      <rect x="8"  y="17.5" width="7" height="1.5" rx=".75" fill={lineFill} opacity=".32" />
      <rect x="8"  y="21"   width="8" height="1.5" rx=".75" fill={lineFill} opacity=".32" />
      <rect x="8"  y="24.5" width="5" height="1.5" rx=".75" fill={lineFill} opacity=".18" />

      {/* Text lines – right page */}
      <rect x="23" y="14"   width="8" height="1.5" rx=".75" fill={lineFill} opacity=".32" />
      <rect x="23" y="17.5" width="7" height="1.5" rx=".75" fill={lineFill} opacity=".32" />
      <rect x="23" y="21"   width="8" height="1.5" rx=".75" fill={lineFill} opacity=".32" />
      <rect x="23" y="24.5" width="5" height="1.5" rx=".75" fill={lineFill} opacity=".18" />

      {/* AI spark — 4-pointed star, top-right, above book */}
      <path d="M32 3L32.85 5.15L35 6L32.85 6.85L32 9L31.15 6.85L29 6L31.15 5.15Z" fill={sparkFill} />
    </svg>
  );
}

export function PklWordmark({ size = 32, lang = "ko", showSubtitle = false, color = "#1C1917", light = false }) {
  const subtitle = lang === "ko" ? "Personal Knowledge Library" : "Personal Knowledge Library";
  const textColor = light ? "#FFF8F0" : color;
  const subColor  = light ? "rgba(255,248,240,0.55)" : "rgba(28,25,23,0.45)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.28 }}>
      <PklMark size={size} light={light} />
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{
          fontSize: size * 0.4,
          fontWeight: 700,
          color: textColor,
          fontFamily: "'DM Sans', 'Pretendard Variable', sans-serif",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}>PKL</span>
        {showSubtitle && (
          <span style={{
            fontSize: size * 0.22,
            color: subColor,
            fontFamily: "'DM Sans', 'Pretendard Variable', sans-serif",
            letterSpacing: "0.02em",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}>{subtitle}</span>
        )}
      </div>
    </div>
  );
}
