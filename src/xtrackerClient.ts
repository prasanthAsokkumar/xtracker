import axios from 'axios';

const BASE_URL = 'https://xtracker.polymarket.com/api';

export interface XTrackerUser {
  id: string;
  handle: string;
  name: string;
  platform: string;
  platformId: string;
  avatarUrl: string;
  verified: boolean;
  trackings: unknown[];
  _count: { posts: number };
}

interface XTrackerResponse<T> {
  success: boolean;
  data: T;
}

export async function getUser(handle: string): Promise<XTrackerUser> {
  const url = `${BASE_URL}/users/${encodeURIComponent(handle)}?platform=X`;
  const { data } = await axios.get<XTrackerResponse<XTrackerUser>>(url, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10_000,
  });
  if (!data.success) {
    throw new Error(`xtracker API returned success=false for ${handle}`);
  }
  return data.data;
}

export async function getTweetCount(handle: string): Promise<number> {
  const user = await getUser(handle);
  return user._count.posts;
}

export interface Tracking {
  id: string;
  userId: string;
  title: string;
  startDate: string;
  endDate: string;
  marketLink: string | null;
  isActive: boolean;
}

export interface TrackingStats {
  total: number;
  cumulative: number;
  pace: number;
  percentComplete: number;
  daysElapsed: number;
  daysRemaining: number;
  daysTotal: number;
  isComplete: boolean;
}

export interface TrackingWithStats extends Tracking {
  stats: TrackingStats;
}

export async function getTrackings(handle: string, activeOnly = true): Promise<Tracking[]> {
  const url = `${BASE_URL}/users/${encodeURIComponent(handle)}/trackings?activeOnly=${activeOnly}`;
  const { data } = await axios.get<XTrackerResponse<Tracking[]>>(url, { timeout: 10_000 });
  if (!data.success) throw new Error(`xtracker trackings failed for ${handle}`);
  return data.data;
}

export async function getTrackingWithStats(id: string): Promise<TrackingWithStats> {
  const url = `${BASE_URL}/trackings/${id}?includeStats=true`;
  const { data } = await axios.get<XTrackerResponse<TrackingWithStats>>(url, { timeout: 10_000 });
  if (!data.success) throw new Error(`xtracker tracking stats failed for ${id}`);
  return data.data;
}

export async function getAllTrackingsWithStats(handle: string): Promise<TrackingWithStats[]> {
  const trackings = await getTrackings(handle, true);
  return Promise.all(trackings.map((t) => getTrackingWithStats(t.id)));
}
