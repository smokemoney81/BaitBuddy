import React from 'react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import ClubProfile from './ClubProfile';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

describe('ClubProfile legacy route', () => {
  it('redirects the PR 477 club route to the maintained Vereinsprofil page', async () => {
    render(
      <MemoryRouter initialEntries={['/clubs/club-123']}>
        <Routes>
          <Route path="/clubs/:clubId" element={<ClubProfile />} />
          <Route path="/Vereinsprofil" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('location')).toHaveTextContent('/Vereinsprofil?id=club-123');
  });
});
