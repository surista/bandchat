import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { mediumImpact, successNotification } from '../../utils/haptics';
import api from '../../services/api';
import ActionSheet from '../../components/ActionSheet';
import { format } from 'date-fns';

export default function StagePlotListScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();
  const { user } = useAuth();

  const [plots, setPlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [showActions, setShowActions] = useState(false);

  const loadPlots = useCallback(async () => {
    try {
      const data = await api.getStagePlots(workspaceId);
      setPlots(data);
    } catch (err) {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadPlots();
  }, [loadPlots]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', loadPlots);
    return unsub;
  }, [navigation, loadPlots]);

  const handleCreate = useCallback(async () => {
    try {
      const plot = await api.createStagePlot(workspaceId, { title: 'Untitled Stage Plot' });
      navigation.navigate('StagePlotEditor', { plotId: plot.id, workspaceId });
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to create stage plot');
    }
  }, [workspaceId, navigation]);

  const handleDuplicate = useCallback(async (plot) => {
    try {
      await api.duplicateStagePlot(plot.id);
      successNotification();
      loadPlots();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to duplicate');
    }
  }, [loadPlots]);

  const handleDelete = useCallback((plot) => {
    Alert.alert(
      'Delete Stage Plot',
      `Delete "${plot.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteStagePlot(plot.id);
              successNotification();
              loadPlots();
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to delete');
            }
          },
        },
      ]
    );
  }, [loadPlots]);

  const handleLongPress = useCallback((plot) => {
    mediumImpact();
    setSelectedPlot(plot);
    setShowActions(true);
  }, []);

  const renderItem = useCallback(({ item }) => {
    const creatorName = item.createdBy?.displayName || item.removedCreatorName || 'Unknown';
    return (
      <TouchableOpacity
        style={[styles.plotItem, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}
        onPress={() => navigation.navigate('StagePlotEditor', { plotId: item.id, workspaceId })}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={250}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Stage plot: ${item.title}`}
      >
        <View style={styles.plotIcon}>
          <Text style={styles.plotIconText}>{'\uD83C\uDFAD'}</Text>
        </View>
        <View style={styles.plotInfo}>
          <Text style={[styles.plotTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.plotMeta, { color: colors.textSecondary }]}>
            {creatorName} {'\u00B7'} {format(new Date(item.updatedAt), 'MMM d, yyyy')}
          </Text>
          {item.gig && (
            <Text style={[styles.plotGig, { color: colors.primary }]} numberOfLines={1}>
              {'\uD83C\uDFB8'} {item.gig.title}
            </Text>
          )}
        </View>
        <Text style={[styles.plotArrow, { color: colors.textSecondary }]}>{'\u203A'}</Text>
      </TouchableOpacity>
    );
  }, [colors, navigation, workspaceId, handleLongPress]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {plots.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>{'\uD83C\uDFAD'}</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No stage plots yet</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Create stage plots to plan your equipment layout for gigs.
          </Text>
          <TouchableOpacity
            style={[styles.createButton, { backgroundColor: '#16a34a' }]}
            onPress={handleCreate}
            activeOpacity={0.7}
          >
            <Text style={styles.createButtonText}>+ Create Stage Plot</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={plots}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
          />
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: '#16a34a' }]}
            onPress={handleCreate}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Create stage plot"
          >
            <Text style={styles.fabText}>+</Text>
          </TouchableOpacity>
        </>
      )}

      <ActionSheet
        visible={showActions}
        onClose={() => setShowActions(false)}
        title={selectedPlot?.title}
        actions={[
          {
            label: 'Duplicate',
            onPress: () => {
              setShowActions(false);
              if (selectedPlot) handleDuplicate(selectedPlot);
            },
          },
          {
            label: 'Delete',
            destructive: true,
            onPress: () => {
              setShowActions(false);
              if (selectedPlot) handleDelete(selectedPlot);
            },
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  plotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  plotIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  plotIconText: {
    fontSize: 22,
  },
  plotInfo: {
    flex: 1,
  },
  plotTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  plotMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  plotGig: {
    fontSize: 13,
    marginTop: 2,
  },
  plotArrow: {
    fontSize: 24,
    fontWeight: '300',
    marginLeft: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  createButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '400',
    marginTop: -2,
  },
});
