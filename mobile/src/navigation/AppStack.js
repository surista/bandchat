import { View, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ErrorBoundary from '../components/ErrorBoundary';
import WorkspaceListScreen from '../screens/workspaces/WorkspaceListScreen';
import OnboardingWizardScreen from '../screens/workspaces/OnboardingWizardScreen';
import ChannelListScreen from '../screens/workspace/ChannelListScreen';
import ChannelScreen from '../screens/workspace/ChannelScreen';
import ThreadScreen from '../screens/workspace/ThreadScreen';
import SongListScreen from '../screens/band/SongListScreen';
import SongDetailScreen from '../screens/band/SongDetailScreen';
import SetlistListScreen from '../screens/band/SetlistListScreen';
import SetlistDetailScreen from '../screens/band/SetlistDetailScreen';
import GigListScreen from '../screens/band/GigListScreen';
import GigDetailScreen from '../screens/band/GigDetailScreen';
import GigGalleryScreen from '../screens/band/GigGalleryScreen';
import GigArchiveScreen from '../screens/band/GigArchiveScreen';
import StatsScreen from '../screens/band/StatsScreen';
import BandMembersScreen from '../screens/band/BandMembersScreen';
import ContactsScreen from '../screens/band/ContactsScreen';
import VenuesScreen from '../screens/band/VenuesScreen';
import VenueDetailScreen from '../screens/band/VenueDetailScreen';
import AnnouncementsScreen from '../screens/band/AnnouncementsScreen';
import PollsScreen from '../screens/band/PollsScreen';
import MedleyListScreen from '../screens/band/MedleyListScreen';
import MedleyDetailScreen from '../screens/band/MedleyDetailScreen';
import RecordingListScreen from '../screens/band/RecordingListScreen';
import RecordingDetailScreen from '../screens/band/RecordingDetailScreen';
import TimelineScreen from '../screens/band/TimelineScreen';
import AchievementsScreen from '../screens/band/AchievementsScreen';
import KittyScreen from '../screens/band/KittyScreen';
import SongIntelligenceScreen from '../screens/band/SongIntelligenceScreen';
import PracticeDashboardScreen from '../screens/band/PracticeDashboardScreen';
import StagePlotListScreen from '../screens/band/StagePlotListScreen';
import StagePlotEditorScreen from '../screens/band/StagePlotEditorScreen';
import LiveModeScreen from '../screens/band/LiveModeScreen';
import LyricsScreen from '../screens/band/LyricsScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import EditProfileScreen from '../screens/settings/EditProfileScreen';
import SecurityScreen from '../screens/settings/SecurityScreen';
import AppearanceScreen from '../screens/settings/AppearanceScreen';
import NotificationsScreen from '../screens/settings/NotificationsScreen';
import UpgradeScreen from '../screens/settings/UpgradeScreen';
import WorkspaceMembersScreen from '../screens/settings/WorkspaceMembersScreen';
import InviteScreen from '../screens/settings/InviteScreen';
import BlockedUsersScreen from '../screens/settings/BlockedUsersScreen';
import WebsiteSettingsScreen from '../screens/settings/WebsiteSettingsScreen';
import MemberProfileScreen from '../screens/workspace/MemberProfileScreen';
import PinnedMessagesScreen from '../screens/workspace/PinnedMessagesScreen';
import SavedMessagesScreen from '../screens/workspace/SavedMessagesScreen';
import SearchScreen from '../screens/workspace/SearchScreen';
import ChannelSettingsScreen from '../screens/workspace/ChannelSettingsScreen';
import MessagesTimelineScreen from '../screens/workspace/TimelineScreen';
import ActivityScreen from '../screens/workspace/ActivityScreen';
import ShareReceiveScreen from '../screens/share/ShareReceiveScreen';
import { useTheme } from '../context/ThemeContext';

const Stack = createNativeStackNavigator();

// iOS-only: enable large titles on top-level list screens for native feel
const iosLargeTitle = Platform.OS === 'ios'
  ? { headerLargeTitle: true, headerLargeTitleShadowVisible: false }
  : {};

export default function AppStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.headerBg },
        headerTintColor: colors.headerText,
        headerTitleStyle: { fontWeight: '600' },
        headerLargeTitleStyle: { color: colors.headerText, fontWeight: '700' },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bgPrimary },
        // Per-screen ErrorBoundary so a render error in one screen doesn't
        // blank the whole app — the user can hit "Try Again" and either
        // recover or navigate back. The top-level boundary in App.js still
        // covers init / context / navigator errors.
        layout: ({ children }) => <ErrorBoundary>{children}</ErrorBoundary>,
      }}
    >
      <Stack.Screen
        name="WorkspaceList"
        component={WorkspaceListScreen}
        options={{ title: 'BandChat', headerShown: false }}
      />
      <Stack.Screen
        name="OnboardingWizard"
        component={OnboardingWizardScreen}
        options={{ headerShown: false, presentation: 'fullScreenModal' }}
      />
      <Stack.Screen
        name="Workspace"
        component={ChannelListScreen}
        options={({ route }) => ({ title: route.params?.name || 'Workspace' })}
      />
      <Stack.Screen
        name="Channel"
        component={ChannelScreen}
        options={({ route }) => {
          const ch = route.params?.channel;
          const isDM = ch?.isDM || ch?.isDirect;
          if (isDM) {
            const name = ch?.displayName
              || ch?.otherMembers?.map(m => m.displayName).join(', ')
              || 'Direct Message';
            return { title: name };
          }
          if (ch?.isPrivate) {
            return {
              headerTitle: () => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="lock-closed" size={14} color={colors.headerText} style={{ marginRight: 5 }} />
                  <Text style={{ color: colors.headerText, fontSize: 17, fontWeight: '600' }}>{ch?.name || 'Channel'}</Text>
                </View>
              ),
            };
          }
          return { title: '# ' + (ch?.name || 'Channel') };
        }}
      />
      <Stack.Screen
        name="Thread"
        component={ThreadScreen}
        options={{ title: 'Thread' }}
      />

      {/* Band Features */}
      <Stack.Screen name="SongList" component={SongListScreen} options={{ title: 'Songs', ...iosLargeTitle }} />
      <Stack.Screen name="SongDetail" component={SongDetailScreen} options={{ title: 'Song' }} />
      <Stack.Screen name="SetlistList" component={SetlistListScreen} options={{ title: 'Setlists', ...iosLargeTitle }} />
      <Stack.Screen name="SetlistDetail" component={SetlistDetailScreen} options={{ title: 'Setlist' }} />
      <Stack.Screen name="GigList" component={GigListScreen} options={{ title: 'Calendar', ...iosLargeTitle }} />
      <Stack.Screen name="GigDetail" component={GigDetailScreen} options={{ title: 'Event' }} />
      <Stack.Screen name="GigGallery" component={GigGalleryScreen} options={({ route }) => ({ title: route.params?.gigTitle ? `${route.params.gigTitle} - Gallery` : 'Gallery' })} />
      <Stack.Screen name="GigArchive" component={GigArchiveScreen} options={{ title: 'Gig Archive', ...iosLargeTitle }} />
      <Stack.Screen name="Stats" component={StatsScreen} options={{ title: 'Stats' }} />
      <Stack.Screen name="BandMembers" component={BandMembersScreen} options={{ title: 'Members', ...iosLargeTitle }} />
      <Stack.Screen name="Contacts" component={ContactsScreen} options={{ title: 'Contacts', ...iosLargeTitle }} />
      <Stack.Screen name="Venues" component={VenuesScreen} options={{ title: 'Venues', ...iosLargeTitle }} />
      <Stack.Screen name="VenueDetail" component={VenueDetailScreen} options={{ title: 'Venue' }} />
      <Stack.Screen name="Announcements" component={AnnouncementsScreen} options={{ title: 'Announcements', ...iosLargeTitle }} />
      <Stack.Screen name="Polls" component={PollsScreen} options={{ title: 'Polls', ...iosLargeTitle }} />
      <Stack.Screen name="MedleyList" component={MedleyListScreen} options={{ title: 'Medleys', ...iosLargeTitle }} />
      <Stack.Screen name="MedleyDetail" component={MedleyDetailScreen} options={{ title: 'Medley' }} />
      <Stack.Screen name="RecordingList" component={RecordingListScreen} options={{ title: 'Recordings', ...iosLargeTitle }} />
      <Stack.Screen name="RecordingDetail" component={RecordingDetailScreen} options={{ title: 'Recording' }} />
      <Stack.Screen name="Timeline" component={TimelineScreen} options={{ title: 'Timeline', ...iosLargeTitle }} />
      <Stack.Screen name="Achievements" component={AchievementsScreen} options={{ title: 'Achievements', ...iosLargeTitle }} />
      <Stack.Screen name="Kitty" component={KittyScreen} options={{ title: 'Band Kitty', ...iosLargeTitle }} />
      <Stack.Screen name="SongIntelligence" component={SongIntelligenceScreen} options={{ title: 'Song Intelligence' }} />
      <Stack.Screen name="PracticeDashboard" component={PracticeDashboardScreen} options={{ title: 'Practice', ...iosLargeTitle }} />
      <Stack.Screen name="StagePlotList" component={StagePlotListScreen} options={{ title: 'Stage Plots', ...iosLargeTitle }} />
      <Stack.Screen name="StagePlotEditor" component={StagePlotEditorScreen} options={{ title: 'Stage Plot' }} />
      {/* Live performance screens: fullScreenModal prevents accidental swipe-dismiss
          during a song. gestureEnabled re-enables edge-swipe-back (headerShown:false
          otherwise disables it on native-stack). */}
      <Stack.Screen
        name="LiveMode"
        component={LiveModeScreen}
        options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }}
      />
      <Stack.Screen
        name="Lyrics"
        component={LyricsScreen}
        options={{ headerShown: false, animation: 'fade', gestureEnabled: true }}
      />

      {/* Settings */}
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings', ...iosLargeTitle }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit Profile' }} />
      <Stack.Screen name="Security" component={SecurityScreen} options={{ title: 'Security' }} />
      <Stack.Screen name="Appearance" component={AppearanceScreen} options={{ title: 'Appearance' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <Stack.Screen name="WorkspaceMembers" component={WorkspaceMembersScreen} options={{ title: 'Members', ...iosLargeTitle }} />
      <Stack.Screen name="Invite" component={InviteScreen} options={{ title: 'Invite People' }} />
      <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} options={{ title: 'Blocked Users' }} />
      <Stack.Screen name="Upgrade" component={UpgradeScreen} options={{ title: 'Upgrade to Pro' }} />
      <Stack.Screen name="WebsiteSettings" component={WebsiteSettingsScreen} options={{ title: 'Band Website' }} />

      {/* Members */}
      <Stack.Screen name="MemberProfile" component={MemberProfileScreen} options={{ title: 'Member' }} />

      {/* Search, Pins & Channel Management */}
      <Stack.Screen name="Search" component={SearchScreen} options={{ title: 'Search' }} />
      <Stack.Screen name="PinnedMessages" component={PinnedMessagesScreen} options={{ title: 'Pinned Messages', ...iosLargeTitle }} />
      <Stack.Screen name="SavedMessages" component={SavedMessagesScreen} options={{ title: 'Saved Messages', ...iosLargeTitle }} />
      <Stack.Screen name="MessagesTimeline" component={MessagesTimelineScreen} options={{ title: 'All Messages', ...iosLargeTitle }} />
      <Stack.Screen name="Activity" component={ActivityScreen} options={{ title: 'Activity', ...iosLargeTitle }} />
      <Stack.Screen name="ChannelSettings" component={ChannelSettingsScreen} options={{ title: 'Channel Settings' }} />

      {/* Share Extension */}
      <Stack.Screen
        name="ShareReceive"
        component={ShareReceiveScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
