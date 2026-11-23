/** An idea's face: its project's own logo, the one Claude drew for it, or a plain tile while that is pending. */

import { useState } from 'react';

export function IdeaMark({ color, logo, size = 22 }: { color: string; logo?: string | undefined; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (logo && !broken) {
    return <img className="idea-mark logo" src={logo} width={size} height={size} alt="" onError={() => setBroken(true)} />;
  }
  return (
    <span
      className="idea-mark pending"
      style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 18%, var(--surface))`, borderColor: `color-mix(in srgb, ${color} 40%, transparent)` }}
      title="Logo on its way"
    />
  );
}
