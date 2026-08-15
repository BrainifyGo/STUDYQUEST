import React from 'react';
import { motion, HTMLMotionProps } from 'motion/react';
import { cn } from '../../lib/utils';

interface IconButtonProps extends HTMLMotionProps<'button'> {
  icon: React.ReactNode;
  label: string; // Required for accessibility
  variant?: 'default' | 'primary' | 'ghost' | 'glass';
  size?: 'sm' | 'md' | 'lg';
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  label,
  variant = 'default',
  size = 'md',
  className,
  ...props
}) => {
  const variants = {
    default: "bg-glass-bg border border-border-main text-text-muted hover:text-text-main",
    primary: "bg-brand-purple text-white shadow-lg shadow-brand-purple/20 hover:bg-brand-purple/90",
    ghost: "bg-transparent text-text-muted hover:text-text-main hover:bg-white/5",
    glass: "bg-white/5 backdrop-blur-sm border border-white/10 text-white hover:bg-white/10"
  };

  const sizes = {
    sm: "p-1.5 rounded-lg",
    md: "p-2.5 rounded-xl",
    lg: "p-3.5 rounded-2xl"
  };

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={label}
      title={label}
      className={cn(
        "flex items-center justify-center transition-all",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {icon}
    </motion.button>
  );
};
