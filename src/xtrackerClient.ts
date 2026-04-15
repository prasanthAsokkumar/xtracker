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
