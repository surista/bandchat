import { useMemo, useRef, useState, useEffect } from 'react';

function BandTimeline({ members, onMemberClick, findUserByName }) {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // Measure container width
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

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

    // End at year after current year
    maxYear = Math.max(maxYear, currentYear) + 1;

    const yearRange = maxYear - minYear;
    const years = [];
    for (let y = minYear; y <= maxYear; y++) {
      years.push(y);
    }

    // Sort members: current first, then by join date, then alphabetical
    // Exclude guests from timeline - they're shown separately
    const sortedMembers = [...members]
      .filter(m => !m.isGuest && m.stints && m.stints.length > 0)
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

  const { minYear, maxYear, years, members: sortedMembers, currentYear } = timelineData;

  // Dimensions - calculated based on container width
  const rowHeight = 36;
  const avatarSize = 22;
  const labelWidth = 110;
  const chartWidth = containerWidth - labelWidth - 10; // Full remaining width
  const yearWidth = chartWidth / (years.length - 1); // Distribute years across full width
  const chartHeight = sortedMembers.length * rowHeight + 40;
  const svgHeight = chartHeight + 20;

  // Helper: convert year to X position (0 = minYear, chartWidth = maxYear)
  const yearToX = (year) => {
    return ((year - minYear) / (maxYear - minYear)) * chartWidth;
  };

  // Avatar component for timeline
  const TimelineAvatar = ({ member, x, y }) => {
    const primaryInstrument = member.stints?.[0]?.instruments?.[0] || member.stints?.[0]?.instrument || 'Unknown';
    const color = getInstrumentColor(primaryInstrument);
    const isCurrent = member.stints.some(s => !s.endDate);

    if (member.imageUrl) {
      return (
        <g>
          {/* Circular clip path */}
          <defs>
            <clipPath id={`avatar-clip-${member.id}`}>
              <circle cx={x + avatarSize / 2} cy={y + avatarSize / 2} r={avatarSize / 2} />
            </clipPath>
          </defs>
          {/* Ring/border */}
          <circle
            cx={x + avatarSize / 2}
            cy={y + avatarSize / 2}
            r={avatarSize / 2 + 1}
            fill="none"
            stroke={isCurrent ? '#10b981' : '#4b5563'}
            strokeWidth="1.5"
          />
          {/* Avatar image */}
          <image
            href={member.imageUrl}
            x={x}
            y={y}
            width={avatarSize}
            height={avatarSize}
            clipPath={`url(#avatar-clip-${member.id})`}
            preserveAspectRatio="xMidYMid slice"
          />
        </g>
      );
    }

    // Fallback to initial letter circle
    return (
      <g>
        <circle
          cx={x + avatarSize / 2}
          cy={y + avatarSize / 2}
          r={avatarSize / 2}
          fill={color}
          opacity={isCurrent ? 1 : 0.6}
        />
        <text
          x={x + avatarSize / 2}
          y={y + avatarSize / 2 + 4}
          fill="white"
          fontSize="10"
          fontWeight="bold"
          textAnchor="middle"
        >
          {member.name.charAt(0)}
        </text>
      </g>
    );
  };

  return (
    <div ref={containerRef} className="w-full">
      <svg width="100%" height={svgHeight} className="block">
        {/* Year labels and grid lines */}
        <g transform={`translate(${labelWidth}, 0)`}>
          {years.map((year) => {
            const x = yearToX(year);
            return (
              <g key={year}>
                {/* Vertical grid line */}
                <line
                  x1={x}
                  y1={20}
                  x2={x}
                  y2={chartHeight}
                  stroke="#374151"
                  strokeWidth="1"
                  strokeDasharray={year % 5 === 0 ? '' : '2,2'}
                />
                {/* Year label */}
                <text
                  x={x}
                  y={14}
                  fill={year === currentYear ? '#10b981' : '#9ca3af'}
                  fontSize="11"
                  textAnchor="middle"
                  fontWeight={year === currentYear ? 'bold' : 'normal'}
                >
                  {year}
                </text>
              </g>
            );
          })}
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
                  width="100%"
                  height={rowHeight}
                  fill={i % 2 === 0 ? '#1f2937' : '#111827'}
                />

                {/* Member avatar and name - clickable if linked to user */}
                <g
                  onClick={() => {
                    const linkedId = member.linkedUserId || member.linkedUser?.id || (findUserByName && findUserByName(member.name));
                    if (linkedId && onMemberClick) {
                      onMemberClick(linkedId);
                    }
                  }}
                  style={{ cursor: (member.linkedUserId || member.linkedUser?.id || (findUserByName && findUserByName(member.name))) ? 'pointer' : 'default' }}
                  className="timeline-member-row"
                >
                  {/* Invisible clickable area */}
                  <rect
                    x={0}
                    y={0}
                    width={labelWidth}
                    height={rowHeight}
                    fill="transparent"
                  />
                  {/* Member avatar */}
                  <TimelineAvatar
                    member={member}
                    x={4}
                    y={(rowHeight - avatarSize) / 2}
                  />

                  {/* Member name */}
                  <text
                    x={avatarSize + 10}
                    y={rowHeight / 2 + 4}
                    fill={isCurrent ? '#ffffff' : '#9ca3af'}
                    fontSize="12"
                    fontWeight={isCurrent ? '500' : '400'}
                  >
                    {member.name.length > (member.isGuest ? 9 : 11) ? member.name.slice(0, member.isGuest ? 7 : 9) + '...' : member.name}
                    {member.isGuest && (
                      <tspan fill="#a855f7" fontSize="10"> (G)</tspan>
                    )}
                  </text>
                </g>

                {/* Timeline bars - one per stint */}
                <g transform={`translate(${labelWidth}, 0)`}>
                  {member.stints.map((stint, stintIdx) => {
                    const startYear = new Date(stint.startDate).getFullYear();
                    const endYear = stint.endDate ? new Date(stint.endDate).getFullYear() : currentYear;
                    const startX = yearToX(startYear);
                    const endX = yearToX(endYear + 1); // +1 to include the full end year
                    const barWidth = endX - startX - 4;
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
                          width={Math.max(barWidth, 8)}
                          height={rowHeight - 12}
                          fill={color}
                          rx={3}
                          opacity={isOngoing ? 1 : 0.6}
                        />
                        {/* Instrument label on bar if wide enough */}
                        {barWidth > 60 && (
                          <text
                            x={startX + barWidth / 2}
                            y={rowHeight / 2 + 3}
                            fill="white"
                            fontSize="10"
                            textAnchor="middle"
                            opacity={0.9}
                          >
                            {instrumentLabel.length > 14 ? instrumentLabel.slice(0, 12) + '...' : instrumentLabel}
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
            x1={yearToX(currentYear)}
            y1={20}
            x2={yearToX(currentYear)}
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
