import WidgetKit
import SwiftUI

// MARK: - Timeline Entry

struct NextGigEntry: TimelineEntry {
    let date: Date
    let gig: GigPayload?
    let gigDate: Date?
    let daysUntil: Int?

    static func empty() -> NextGigEntry {
        NextGigEntry(date: Date(), gig: nil, gigDate: nil, daysUntil: nil)
    }

    static func from(_ payload: GigPayload) -> NextGigEntry {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let gigDate = formatter.date(from: payload.date) ?? {
            // Try without fractional seconds
            let f2 = ISO8601DateFormatter()
            f2.formatOptions = [.withInternetDateTime]
            return f2.date(from: payload.date)
        }()

        var daysUntil: Int? = nil
        if let gd = gigDate {
            let calendar = Calendar.current
            let startOfToday = calendar.startOfDay(for: Date())
            let startOfGig = calendar.startOfDay(for: gd)
            daysUntil = calendar.dateComponents([.day], from: startOfToday, to: startOfGig).day
        }

        return NextGigEntry(date: Date(), gig: payload, gigDate: gigDate, daysUntil: daysUntil)
    }
}

// MARK: - Timeline Provider

struct NextGigProvider: TimelineProvider {
    func placeholder(in context: Context) -> NextGigEntry {
        let sample = GigPayload(
            gigId: "sample",
            workspaceId: "sample",
            title: "Saturday Night Live",
            date: ISO8601DateFormatter().string(from: Date().addingTimeInterval(86400 * 3)),
            endDate: nil,
            venue: "The Blue Note",
            type: "GIG",
            attendanceStatus: "ATTENDING",
            workspaceName: "My Band",
            soundCheckTime: "16:00",
            eventStartTime: "19:00",
            performanceStartTime: "20:00"
        )
        return NextGigEntry.from(sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (NextGigEntry) -> Void) {
        if let payload = SharedGigData.load() {
            completion(NextGigEntry.from(payload))
        } else {
            completion(placeholder(in: context))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NextGigEntry>) -> Void) {
        let entry: NextGigEntry
        if let payload = SharedGigData.load() {
            entry = NextGigEntry.from(payload)
        } else {
            entry = NextGigEntry.empty()
        }

        // Refresh at next midnight so day count updates
        let calendar = Calendar.current
        let tomorrow = calendar.startOfDay(for: Date().addingTimeInterval(86400))
        let timeline = Timeline(entries: [entry], policy: .after(tomorrow))
        completion(timeline)
    }
}

// MARK: - Formatters

private func formatGigDate(_ date: Date?) -> String {
    guard let date = date else { return "" }
    let formatter = DateFormatter()
    formatter.dateFormat = "EEE, MMM d"
    return formatter.string(from: date)
}

private func formatGigDateShort(_ date: Date?) -> String {
    guard let date = date else { return "" }
    let formatter = DateFormatter()
    formatter.dateFormat = "MMM d"
    return formatter.string(from: date)
}

private func gigTypeIcon(_ type: String) -> String {
    switch type {
    case "REHEARSAL": return "music.note.list"
    case "RECORDING": return "waveform"
    case "OTHER": return "calendar"
    default: return "music.mic"
    }
}

private func gigTypeLabel(_ type: String) -> String {
    switch type {
    case "REHEARSAL": return "Rehearsal"
    case "RECORDING": return "Recording"
    case "OTHER": return "Event"
    default: return "Gig"
    }
}

private func attendanceColor(_ status: String?) -> Color {
    switch status {
    case "ATTENDING": return .green
    case "MAYBE": return .orange
    case "NOT_ATTENDING": return .red
    default: return .secondary
    }
}

private func attendanceLabel(_ status: String?) -> String {
    switch status {
    case "ATTENDING": return "Going"
    case "MAYBE": return "Maybe"
    case "NOT_ATTENDING": return "Not going"
    default: return "No response"
    }
}

// MARK: - Lock Screen Views

struct NextGigCircularView: View {
    let entry: NextGigEntry

    var body: some View {
        if let gig = entry.gig, let days = entry.daysUntil {
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    if days == 0 {
                        Image(systemName: "music.mic")
                            .font(.system(size: 14, weight: .bold))
                        Text("TODAY")
                            .font(.system(size: 8, weight: .bold))
                    } else if days == 1 {
                        Text("\(days)")
                            .font(.system(size: 22, weight: .bold))
                        Text("DAY")
                            .font(.system(size: 8, weight: .bold))
                    } else {
                        Text("\(days)")
                            .font(.system(size: 22, weight: .bold))
                        Text("DAYS")
                            .font(.system(size: 8, weight: .bold))
                    }
                }
            }
            .widgetURL(URL(string: "bandchat://gig/\(gig.gigId)?ws=\(gig.workspaceId)"))
        } else {
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 2) {
                    Image(systemName: "calendar")
                        .font(.system(size: 14))
                    Text("---")
                        .font(.system(size: 10, weight: .medium))
                }
            }
            .widgetURL(URL(string: "bandchat://"))
        }
    }
}

struct NextGigRectangularView: View {
    let entry: NextGigEntry

    var body: some View {
        if let gig = entry.gig {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: gigTypeIcon(gig.type))
                        .font(.system(size: 10))
                    Text(gig.title)
                        .font(.system(size: 14, weight: .semibold))
                        .lineLimit(1)
                }
                Text(formatGigDate(entry.gigDate))
                    .font(.system(size: 12))
                if let venue = gig.venue ?? gig.workspaceName {
                    Text(venue)
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .widgetURL(URL(string: "bandchat://gig/\(gig.gigId)?ws=\(gig.workspaceId)"))
        } else {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: "calendar")
                        .font(.system(size: 10))
                    Text("BandChat")
                        .font(.system(size: 14, weight: .semibold))
                }
                Text("No upcoming events")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .widgetURL(URL(string: "bandchat://"))
        }
    }
}

struct NextGigInlineView: View {
    let entry: NextGigEntry

    var body: some View {
        if let gig = entry.gig {
            HStack(spacing: 4) {
                Image(systemName: gigTypeIcon(gig.type))
                Text("\(gig.title) \u{2022} \(formatGigDateShort(entry.gigDate))")
            }
            .widgetURL(URL(string: "bandchat://gig/\(gig.gigId)?ws=\(gig.workspaceId)"))
        } else {
            Text("No upcoming gigs")
                .widgetURL(URL(string: "bandchat://"))
        }
    }
}

// MARK: - Home Screen Views

struct NextGigSmallView: View {
    let entry: NextGigEntry

    var body: some View {
        if let gig = entry.gig {
            VStack(alignment: .leading, spacing: 6) {
                // Type badge
                HStack(spacing: 4) {
                    Image(systemName: gigTypeIcon(gig.type))
                        .font(.system(size: 10, weight: .semibold))
                    Text(gigTypeLabel(gig.type).uppercased())
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .tracking(0.5)
                }
                .foregroundColor(.accentColor)

                Spacer()

                // Title
                Text(gig.title)
                    .font(.system(size: 15, weight: .bold))
                    .lineLimit(2)
                    .foregroundColor(.primary)

                // Date
                Text(formatGigDate(entry.gigDate))
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.secondary)

                // Venue
                if let venue = gig.venue {
                    HStack(spacing: 3) {
                        Image(systemName: "mappin")
                            .font(.system(size: 9))
                        Text(venue)
                            .font(.system(size: 11))
                            .lineLimit(1)
                    }
                    .foregroundColor(.secondary)
                }

                // Days countdown
                if let days = entry.daysUntil {
                    HStack {
                        Spacer()
                        Text(days == 0 ? "TODAY" : days == 1 ? "TOMORROW" : "IN \(days) DAYS")
                            .font(.system(size: 9, weight: .bold, design: .rounded))
                            .foregroundColor(days <= 1 ? .orange : .accentColor)
                    }
                }
            }
            .padding(14)
            .widgetURL(URL(string: "bandchat://gig/\(gig.gigId)?ws=\(gig.workspaceId)"))
        } else {
            VStack(spacing: 8) {
                Image(systemName: "calendar")
                    .font(.system(size: 28))
                    .foregroundColor(.secondary)
                Text("No upcoming\nevents")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(14)
            .widgetURL(URL(string: "bandchat://"))
        }
    }
}

struct NextGigMediumView: View {
    let entry: NextGigEntry

    var body: some View {
        if let gig = entry.gig {
            HStack(spacing: 12) {
                // Left: days countdown
                VStack(spacing: 2) {
                    if let days = entry.daysUntil {
                        if days == 0 {
                            Image(systemName: "music.mic")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(.orange)
                            Text("TODAY")
                                .font(.system(size: 10, weight: .bold, design: .rounded))
                                .foregroundColor(.orange)
                        } else {
                            Text("\(days)")
                                .font(.system(size: 32, weight: .bold, design: .rounded))
                                .foregroundColor(.accentColor)
                            Text(days == 1 ? "DAY" : "DAYS")
                                .font(.system(size: 10, weight: .bold, design: .rounded))
                                .foregroundColor(.accentColor)
                        }
                    }
                }
                .frame(width: 60)

                // Divider
                Rectangle()
                    .fill(Color.secondary.opacity(0.3))
                    .frame(width: 1)

                // Right: gig details
                VStack(alignment: .leading, spacing: 4) {
                    // Type badge
                    HStack(spacing: 4) {
                        Image(systemName: gigTypeIcon(gig.type))
                            .font(.system(size: 9))
                        Text(gigTypeLabel(gig.type).uppercased())
                            .font(.system(size: 8, weight: .bold, design: .rounded))
                            .tracking(0.5)
                    }
                    .foregroundColor(.accentColor)

                    // Title
                    Text(gig.title)
                        .font(.system(size: 15, weight: .bold))
                        .lineLimit(1)

                    // Date
                    Text(formatGigDate(entry.gigDate))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.secondary)

                    // Venue + times
                    HStack(spacing: 12) {
                        if let venue = gig.venue {
                            HStack(spacing: 3) {
                                Image(systemName: "mappin")
                                    .font(.system(size: 9))
                                Text(venue)
                                    .font(.system(size: 11))
                                    .lineLimit(1)
                            }
                            .foregroundColor(.secondary)
                        }

                        if let time = gig.performanceStartTime ?? gig.eventStartTime {
                            HStack(spacing: 3) {
                                Image(systemName: "clock")
                                    .font(.system(size: 9))
                                Text(time)
                                    .font(.system(size: 11))
                            }
                            .foregroundColor(.secondary)
                        }
                    }

                    // Attendance + workspace
                    HStack(spacing: 8) {
                        // Attendance badge
                        HStack(spacing: 3) {
                            Circle()
                                .fill(attendanceColor(gig.attendanceStatus))
                                .frame(width: 6, height: 6)
                            Text(attendanceLabel(gig.attendanceStatus))
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.secondary)
                        }

                        if let wsName = gig.workspaceName {
                            Text(wsName)
                                .font(.system(size: 10))
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                        }
                    }
                }

                Spacer(minLength: 0)
            }
            .padding(14)
            .widgetURL(URL(string: "bandchat://gig/\(gig.gigId)?ws=\(gig.workspaceId)"))
        } else {
            HStack(spacing: 12) {
                Image(systemName: "calendar")
                    .font(.system(size: 28))
                    .foregroundColor(.secondary)
                VStack(alignment: .leading, spacing: 4) {
                    Text("No upcoming events")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.secondary)
                    Text("Open BandChat to add a gig")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary.opacity(0.7))
                }
                Spacer()
            }
            .padding(14)
            .widgetURL(URL(string: "bandchat://"))
        }
    }
}

// MARK: - Widget Declarations

struct NextGigCountdownWidget: Widget {
    let kind: String = "NextGigCountdown"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NextGigProvider()) { entry in
            if #available(iOS 17.0, *) {
                Group {
                    switch WidgetFamily(rawValue: 0) {
                    default:
                        NextGigWidgetEntryView(entry: entry)
                    }
                }
                .containerBackground(.fill.tertiary, for: .widget)
            } else {
                NextGigWidgetEntryView(entry: entry)
            }
        }
        .configurationDisplayName("Next Gig Countdown")
        .description("See when your next gig is at a glance.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct NextGigCardWidget: Widget {
    let kind: String = "NextGigCard"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NextGigProvider()) { entry in
            if #available(iOS 17.0, *) {
                NextGigWidgetEntryView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                NextGigWidgetEntryView(entry: entry)
                    .background(Color(UIColor.systemBackground))
            }
        }
        .configurationDisplayName("Next Gig")
        .description("Your upcoming gig details at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Unified Entry View (selects layout by family)

struct NextGigWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: NextGigEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            NextGigCircularView(entry: entry)
        case .accessoryRectangular:
            NextGigRectangularView(entry: entry)
        case .accessoryInline:
            NextGigInlineView(entry: entry)
        case .systemSmall:
            NextGigSmallView(entry: entry)
        case .systemMedium:
            NextGigMediumView(entry: entry)
        default:
            NextGigSmallView(entry: entry)
        }
    }
}

// MARK: - Widget Bundle

@main
struct BandChatWidgetBundle: WidgetBundle {
    var body: some Widget {
        NextGigCountdownWidget()
        NextGigCardWidget()
    }
}
