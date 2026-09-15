import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';

// Mock für Fischarten-Auswahl-Component
function FishSpeciesSelector({ onSelect }) {
  const [selectedSpecies, setSelectedSpecies] = useState(null);
  const species = ['Forelle', 'Hecht', 'Barsch', 'Karpfen'];

  const handleSelect = (fish) => {
    setSelectedSpecies(fish);
    onSelect?.(fish);
  };

  return (
    <div>
      <p>Wähle eine Fischart:</p>
      {species.map(fish => (
        <button
          key={fish}
          onClick={() => handleSelect(fish)}
          aria-pressed={selectedSpecies === fish}
        >
          {fish}
        </button>
      ))}
      {selectedSpecies && <p data-testid="selected">{selectedSpecies}</p>}
    </div>
  );
}

describe('FishSpeciesSelector – Fischarten-Auswahl', () => {
  it('zeigt alle verfügbaren Fischarten', () => {
    render(<FishSpeciesSelector />);

    expect(screen.getByText('Forelle')).toBeInTheDocument();
    expect(screen.getByText('Hecht')).toBeInTheDocument();
    expect(screen.getByText('Barsch')).toBeInTheDocument();
    expect(screen.getByText('Karpfen')).toBeInTheDocument();
  });

  it('speichert die ausgewählte Fischart', () => {
    const { rerender } = render(<FishSpeciesSelector />);

    fireEvent.click(screen.getByText('Hecht'));

    expect(screen.getByTestId('selected')).toHaveTextContent('Hecht');
  });

  it('ruft onSelect mit der gewählten Fischart auf', () => {
    const onSelect = vi.fn();
    render(<FishSpeciesSelector onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Forelle'));

    expect(onSelect).toHaveBeenCalledWith('Forelle');
  });

  it('markiert die ausgewählte Fischart mit aria-pressed', () => {
    render(<FishSpeciesSelector />);

    const hechtButton = screen.getByText('Hecht');
    fireEvent.click(hechtButton);

    expect(hechtButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('löscht den Marker bei einer neuen Auswahl', () => {
    render(<FishSpeciesSelector />);

    fireEvent.click(screen.getByText('Forelle'));
    expect(screen.getByText('Forelle')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByText('Barsch'));
    expect(screen.getByText('Forelle')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Barsch')).toHaveAttribute('aria-pressed', 'true');
  });
});
