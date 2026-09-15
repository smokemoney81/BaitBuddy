// Test helper für Auth-Tests
export function createMockAuthContext() {
  return {
    getToken: () => localStorage.getItem('bb_token'),
    setToken: (token) => localStorage.setItem('bb_token', token),
    getRefreshToken: () => localStorage.getItem('bb_refresh'),
    setRefreshToken: (token) => localStorage.setItem('bb_refresh', token),
    me: async () => ({ id: 'test-user', email: 'test@example.com' }),
  };
}

export function createMockUser(overrides = {}) {
  return {
    id: 'user-123',
    email: 'test@example.com',
    user_metadata: {
      nickname: 'TestUser',
      premium_plan: 'free',
      premium_expires_at: null,
      ...overrides.user_metadata,
    },
    ...overrides,
  };
}
