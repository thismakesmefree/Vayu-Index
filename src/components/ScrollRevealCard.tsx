import React from 'react';
import { motion } from 'motion/react';

interface ScrollRevealCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  id?: string;
  testId?: string;
  /** Keep hero / above-the-fold cards instantly visible on first paint while still animating on scroll exit/re-entry */
  immediate?: boolean;
}

/**
 * GPU-accelerated scroll-linked widget card wrapper.
 * Cards smoothly glide into place when entering the viewport, fade/recede when scrolled past,
 * and reappear seamlessly when scrolling back (`viewport.once = false`).
 */
export const ScrollRevealCard: React.FC<ScrollRevealCardProps> = ({
  children,
  className = '',
  delay = 0,
  id,
  testId,
  immediate = false,
}) => {
  return (
    <motion.div
      id={id}
      data-testid={testId}
      data-scroll-reveal-card="true"
      initial={immediate ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 26, scale: 0.965 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: false, amount: 0.12, margin: '-28px 0px -28px 0px' }}
      transition={{
        duration: 0.46,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={`vayu-gpu ${className}`}
    >
      {children}
    </motion.div>
  );
};
