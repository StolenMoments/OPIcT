import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import './Button.css';

type Variant = 'primary' | 'default' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'default', size = 'md', loading = false, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  const classes = ['btn', `btn--${variant}`, `btn--${size}`, loading ? 'btn--loading' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="btn__spinner" aria-hidden="true" />}
      <span className="btn__label">{children}</span>
    </button>
  );
});

export default Button;
