import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * TourSpotlight: Canvas-basierte Ausstanzungseffekt
 * Zeichnet einen Kreis um das Ziel-Element und dunkelt den Rest ab.
 * Responsive bei Fenster-Resize.
 */
export default function TourSpotlight({ targetRef, isVisible, padding = 12 }) {
  const canvasRef = useRef(null);
  const [_canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const animationFrameRef = useRef(null);

  // Berechne Spotlight-Position und Größe aus Target-Element
  const getSpotlightRect = () => {
    if (!targetRef?.current) return null;

    const rect = targetRef.current.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
    };
  };

  // Zeichne Canvas mit Spotlight-Effekt
  const drawSpotlight = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const spotlight = getSpotlightRect();

    if (!spotlight) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // Setze Canvas-Größe
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    setCanvasSize({ width: canvas.width, height: canvas.height });

    // Fülle mit dunkelm Overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Berechne Radius (ovale Umrandung mit Padding)
    const radiusX = spotlight.width / 2 + padding;
    const radiusY = spotlight.height / 2 + padding;

    // Zeichne transparenten Kreis um Element (Spotlight)
    ctx.clearRect(
      spotlight.x - radiusX,
      spotlight.y - radiusY,
      radiusX * 2,
      radiusY * 2
    );

    // Optional: Weicher Rand-Effekt via radiales Gradient
    const gradient = ctx.createRadialGradient(
      spotlight.x,
      spotlight.y,
      radiusX * 0.85,
      spotlight.x,
      spotlight.y,
      radiusX * 1.1
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.75)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(spotlight.x, spotlight.y, radiusX, radiusY, 0, 0, 2 * Math.PI);
    ctx.fill();

    // Optional: Ring-Rand um Spotlight
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(spotlight.x, spotlight.y, radiusX, radiusY, 0, 0, 2 * Math.PI);
    ctx.stroke();
  };

  // Beobachte Fenster-Resize und Target-Änderungen
  useEffect(() => {
    if (!isVisible) return;

    // Initial Draw
    drawSpotlight();

    // Redraw bei Resize
    const handleResize = () => {
      drawSpotlight();
    };

    window.addEventListener('resize', handleResize);

    // Animationsr-Loop für sanfte Übergänge
    const animate = () => {
      drawSpotlight();
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isVisible, targetRef, padding]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.canvas
          ref={canvasRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-40 pointer-events-none"
          style={{ backgroundColor: 'transparent' }}
        />
      )}
    </AnimatePresence>
  );
}
