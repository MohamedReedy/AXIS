import React, { useState, useEffect } from 'react';

interface ForensicWatermarkProps {
  studentName: string;
  studentEmail: string;
  studentCode?: string;
  attemptId?: string | null;
}

export const ForensicWatermark: React.FC<ForensicWatermarkProps> = ({
  studentName,
  studentEmail,
  studentCode,
  attemptId,
}) => {
  const [liveTimestamp, setLiveTimestamp] = useState<string>(() =>
    new Date().toLocaleTimeString('en-US', { hour12: false })
  );

  // Update watermark timestamp every 10 seconds for temporal forensic validity
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveTimestamp(new Date().toLocaleTimeString('en-US', { hour12: false }));
    }, 10000);

    return () => clearInterval(timer);
  }, []);

  const candidateIdShort = attemptId ? attemptId.slice(0, 8).toUpperCase() : studentCode || 'AXIS';
  const line1 = `${studentName.trim()} • ${candidateIdShort}`;
  const line2 = `${studentEmail.trim().toLowerCase()}`;
  const line3 = `AXIS SECURE PROCTOR • ${liveTimestamp}`;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-20 h-full w-full select-none overflow-hidden"
      style={{ WebkitUserSelect: 'none' }}
    >
      <svg
        className="h-full w-full opacity-[0.065] transition-opacity duration-300"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="axis-forensic-pattern"
            width="340"
            height="180"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-18 50 50)"
          >
            <text
              x="20"
              y="45"
              fill="#0B1120"
              fontSize="12"
              fontWeight="900"
              fontFamily="system-ui, -apple-system, sans-serif"
              letterSpacing="0.04em"
            >
              {line1}
            </text>
            <text
              x="20"
              y="70"
              fill="#1E293B"
              fontSize="10"
              fontWeight="700"
              fontFamily="monospace"
              letterSpacing="0.02em"
            >
              {line2}
            </text>
            <text
              x="20"
              y="92"
              fill="#0052D4"
              fontSize="9"
              fontWeight="800"
              fontFamily="monospace"
              letterSpacing="0.06em"
            >
              {line3}
            </text>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#axis-forensic-pattern)" />
      </svg>
    </div>
  );
};
