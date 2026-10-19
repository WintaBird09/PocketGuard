import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Money, ProgressBar, Screen } from './components';

export default function ThemeDemoScreen() {
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.heading}>Pocket Guard Theme Demo</Text>
        <Card>
          <Text style={styles.label}>Amount</Text>
          <Money value={120000} />
        </Card>

        <Card>
          <Text style={styles.label}>Primary action</Text>
          <Button label="Add expense" onPress={() => undefined} />
        </Card>

        <Card>
          <Text style={styles.label}>Progress</Text>
          <ProgressBar value={80} />
        </Card>

        <Card>
          <Text style={styles.label}>Dark theme</Text>
          <View style={styles.darkBox}>
            <Money value={45000} theme="dark" />
            <Button label="Secondary" variant="secondary" theme="dark" onPress={() => undefined} />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: 16,
    paddingBottom: 32,
  },
  heading: {
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  darkBox: {
    backgroundColor: '#020817',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
});
