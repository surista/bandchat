import { useMemo } from 'react';

function BandTimeline({ members }) {
  const getInstrumentColor = (instrument) => {
    const colors = {
      'Vocals': '#9333ea', // purple
      'Lead Guitar': '#dc2626', // red
      'Rhythm Guitar': '#ef4444', // red lighter
      'Guitar': '#dc2626',
      'Bass': '#2563eb', // blue
      'Drums': '#16a34a', // green
      'Keyboard': '#f97316', // orange
      'Piano': '#f97316',
      'Saxophone': '#ca8a04', // yellow
      'Trumpet': '#eab308',
      'Harmonica': '#0891b2', // cyan
      'Violin': '#ec4899', // pink
      'Percussion': '#22c55e', // green lighter
      'DJ': '#06b6d4', // cyan
    };
    return colors[instrument] || '#6b7280'; // gray
  };

  const timelineData = useMemo(() => {
    if (!members || members.length === 0) return null;

    const currentYear = new Date().getFullYear();
    let minYear = currentYear;
    let maxYear = currentYear;

    // Find year range from all stints
    members.forEach((m) => {
      if (m.stints && m.stints.length > 0) {
        m.stints.forEach((stint) => {
          const startYear = new Date(stint.startDate).getFullYear();
          const endYear = stint.endDate ? new Date(stint.endDate).getFullYear() : currentYear;
          minYear = Math.min(minYear, startYear);
          maxYear = Math.max(maxYear, endYear);
        });
      }
    });

    // Add padding to end only (start at first member's year)
    maxYear = Math.max(maxYear, currentYear) + 1;

    const yearRange = maxYear - minYear;
    const years = [];
    for (let y = minYear; y <= maxYear; y++) {
      years.push(y);
    }

    // Sort members: current first, then by join date, then alphabetical
    const sortedMembers = [...members]
      .filter(m => m.stints && m.stints.length > 0)
      .sort((a, b) => {
        const aIsCurrent = a.stints.some(s => !s.endDate);
        const bIsCurrent = b.stints.some(s => !s.endDate);

        // Current members first
        if (aIsCurrent && !bIsCurrent) return -1;
        if (!aIsCurrent && bIsCurrent) return 1;

        // Within same group, sort by earliest join date
        const aMin = Math.min(...a.stints.map(s => new Date(s.startDate).getTime()));
        const bMin = Math.min(...b.stints.map(s => new Date(s.startDate).getTime()));
        if (aMin !== bMin) return aMin - bMin;

        // If same join date, sort alphabetically
        return a.name.localeCompare(b.name);
      });

    return {
      minYear,
      maxYear,
      yearRange,
      years,
      members: sortedMembers,
      currentYear,
    };
  }, [members]);

  if (!timelineData || timelineData.members.length === 0) {
    return <div className="text-gray-500 text-center py-4">No timeline data</div>;
  }

  const { minYear, years, members: sortedMembers, currentYear } = timelineData;

  // Dimensions
  const rowHeight = 32;
  const labelWidth = 120;
  const yearWidth = 60;
  const chartWidth = years.length * yearWidth;
  const chartHeight = sortedMembers.length * rowHeight + 40; // +40 for year labels
  const svgWidth = labelWidth + chartWidth + 20;
  const svgHeight = chartHeight + 20;

  return (
    <div className="overflow-x-auto">
      <svg width={svgWidth} height={svgHeight} className="min-w-full">
        {/* Year labels and grid lines */}
        <g transform={`translate(${labelWidth}, 0)`}>
          {years.map((year, i) => (
            <g key={year}>
              {/* Vertical grid line */}
              <line
                x1={i * yearWidth}
                y1={20}
                x2={i * yearWidth}
                y2={chartHeight}
                stroke="#374151"
                strokeWidth="1"
                strokeDasharray={year % 5 === 0 ? '' : '2,2'}
              />
              {/* Year label (show every year or every 2 years if many) */}
              {(years.length <= 20 || year % 2 === 0 || year === currentYear) && (
                <text
                  x={i * yearWidth}
                  y={14}
                  fill={year === currentYear ? '#10b981' : '#9ca3af'}
                  fontSize="11"
                  textAnchor="middle"
                  fontWeight={year === currentYear ? 'bold' : 'normal'}
                >
                  {year}
                </text>
              )}
            </g>
          ))}
        </g>

        {/* Member rows */}
        <g transform={`translate(0, 28)`}>
          {sortedMembers.map((member, i) => {
            // Check if member has any current stint
            const isCurrent = member.stints.some(s => !s.endDate);

            return (
              <g key={member.id} transform={`translate(0, ${i * rowHeight})`}>
                {/* Row background */}
                <rect
                  x={0}
                  y={0}
                  width={svgWidth}
                  height={rowHeight}
                  fill={i % 2 === 0 ? '#1f2937' : '#111827'}
                />

                {/* Member name */}
                <text
                  x={5}
                  y={rowHeight / 2 + 4}
                  fill={isCurrent ? '#ffffff' : '#9ca3af'}
                  fontSize="12"
                  fontWeight={isCurrent ? '500' : '400'}
                >
                  {member.name.length > (member.isGuest ? 11 : 14) ? member.name.slice(0, member.isGuest ? 9 : 12) + '...' : member.name}
                  {member.isGuest && (
                    <tspan fill="#a855f7" fontSize="10"> (G)</tspan>
                  )}
                </text>

                {/* Timeline bars - one per stint */}
                <g transform={`translate(${labelWidth}, 0)`}>
                  {member.stints.map((stint, stintIdx) => {
                    const startYear = new Date(stint.startDate).getFullYear();
                    const endYear = stint.endDate ? new Date(stint.endDate).getFullYear() : currentYear;
                    const startX = (startYear - minYear) * yearWidth;
                    const width = (endYear - startYear + 1) * yearWidth - 4;
                    const instruments = stint.instruments || (stint.instrument ? [stint.instrument] : []);
                    const primaryInstrument = instruments[0] || 'Unknown';
                    const color = getInstrumentColor(primaryInstrument);
                    const isOngoing = !stint.endDate;
                    const instrumentLabel = instruments.length > 1
                      ? `${primaryInstrument} +${instruments.length - 1}`
                      : primaryInstrument;

                    return (
                      <g key={stint.id || stintIdx}>
                        <rect
                          x={startX + 2}
                          y={6}
                          width={Math.max(width, 8)}
                          height={rowHeight - 12}
                          fill={color}
                          rx={3}
                          opacity={isOngoing ? 1 : 0.6}
                        />
                        {/* Instrument label on bar if wide enough */}
                        {width > 50 && (
                          <text
                            x={startX + width / 2}
                            y={rowHeight / 2 + 3}
                            fill="white"
                            fontSize="10"
                            textAnchor="middle"
                            opacity={0.9}
                          >
                            {instrumentLabel.length > 12 ? instrumentLabel.slice(0, 10) + '...' : instrumentLabel}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </g>
            );
          })}
        </g>

        {/* Current year marker */}
        <g transform={`translate(${labelWidth}, 0)`}>
          <line
            x1={(currentYear - minYear) * yearWidth}
            y1={20}
            x2={(currentYear - minYear) * yearWidth}
            y2={chartHeight}
            stroke="#10b981"
            strokeWidth="2"
          />
        </g>
      </svg>
    </div>
  );
}

export default BandTimeline;
