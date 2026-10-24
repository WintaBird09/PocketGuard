import { Redirect } from 'expo-router';

import { initialAppRoute } from '@/src/data/bootstrap';

export default function HomeScreen() {
  return <Redirect href={initialAppRoute} />;
}
