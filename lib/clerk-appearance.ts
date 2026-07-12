/**
 * Shared Clerk appearance for the authentication screens (sign-in / sign-up).
 *
 * Dark, immersive "members-only" aesthetic: glassmorphic inputs/social buttons
 * on a deep onyx background, with a blue→indigo gradient primary action. Header
 * and footer are hidden because the auth layout renders the logo, the
 * sign-in/up switch link, trust badges, and footer itself.
 *
 * Edges are drawn with an INSET box-shadow ring rather than a CSS `border`.
 * On translucent (glassmorphic) surfaces a 1px translucent border overlaps the
 * translucent fill at the rounded corners and renders a visible seam/notch (a
 * "cut out" look). An inset ring follows the border-radius cleanly with no seam.
 *
 * IMPORTANT: every class below must be written as a complete literal string so
 * Tailwind's content scanner can detect and generate it (no runtime string
 * concatenation, or the utilities silently won't exist).
 *
 * The `!` (important) prefixes guarantee these styles win over the light-theme
 * defaults set on the global <ClerkProvider> (appearance merges by element key).
 */
export const authAppearance = {
  variables: {
    colorPrimary: '#5B4BFF',
    colorText: '#FFFFFF',
    colorTextSecondary: 'rgba(255,255,255,0.55)',
    colorBackground: 'transparent',
    colorInputBackground: 'rgba(255,255,255,0.05)',
    colorInputText: '#FFFFFF',
    colorNeutral: '#FFFFFF',
    colorDanger: '#ff7a7a',
    colorSuccess: '#6ee7a8',
    borderRadius: '0.75rem',
    fontFamily: '"sofia-pro", sans-serif',
  },
  elements: {
    rootBox: 'w-full overflow-visible!',
    cardBox: 'w-full overflow-visible! border-0! bg-transparent! shadow-none!',
    card: 'w-full overflow-visible! border-0! bg-transparent! p-0! shadow-none! gap-5',
    header: 'hidden!',
    main: 'gap-5',
    socialButtons: 'gap-2.5',
    socialButtonsBlockButton:
      'h-12! rounded-xl! border-0! bg-white/5! text-white! shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]! transition-all duration-200 hover:bg-white/9! hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.20)]!',
    socialButtonsBlockButtonText: 'text-white! font-medium! text-[15px]',
    socialButtonsProviderIcon: 'h-5 w-5',
    dividerRow: 'my-1',
    dividerLine: 'bg-white/10!',
    dividerText: 'text-white/40! uppercase text-[11px] tracking-[0.18em]',
    form: 'gap-5',
    formField: 'gap-2',
    formFieldLabelRow: 'mb-0.5',
    formFieldLabel: 'text-white/55! uppercase tracking-[0.12em] text-[11px] font-semibold',
    formFieldInputGroup: 'border-0! bg-transparent! shadow-none!',
    formFieldInput:
      'h-12! rounded-xl! border-0! bg-white/5! text-white! shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]! placeholder:text-white/30! transition-all duration-200 focus:bg-white/[0.07]! focus:shadow-[inset_0_0_0_1px_rgba(122,91,255,0.80)]!',
    // Phone field: the ring lives on the wrapper (country selector + input);
    // the inner input goes transparent and gets breathing room after the +1.
    phoneInputBox:
      'h-12! rounded-xl! border-0! bg-white/5! shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]! gap-0! transition-all duration-200 focus-within:bg-white/[0.07]! focus-within:shadow-[inset_0_0_0_1px_rgba(122,91,255,0.80)]!',
    formFieldInput__phoneNumber:
      'h-12! rounded-xl! border-0! bg-transparent! text-white! shadow-none! placeholder:text-white/30! pl-3! focus:bg-transparent! focus:shadow-none!',
    formFieldAction: 'text-[#8b95ff]! hover:text-white! text-sm font-medium',
    formButtonPrimary:
      'h-12! rounded-xl! border-0! bg-linear-to-r! from-[#2342f0]! to-[#7a5bff]! text-white! text-[15px]! font-semibold! normal-case! tracking-normal! shadow-[0_12px_30px_-10px_rgba(67,76,255,0.7)]! transition-all duration-200 hover:brightness-110! hover:shadow-[0_16px_38px_-8px_rgba(67,76,255,0.9)]!',
    footer: 'hidden!',
    identityPreviewText: 'text-white!',
    identityPreviewEditButton: 'text-[#8b95ff]! hover:text-white!',
    formResendCodeLink: 'text-[#8b95ff]! hover:text-white!',
    otpCodeFieldInput:
      'rounded-xl! border-0! bg-white/5! text-white! shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]!',
    formFieldInputShowPasswordButton: 'text-white/40! hover:text-white!',
    alert: 'rounded-xl! border-0! bg-white/5! shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]!',
    alertText: 'text-white/80!',
    formFieldSuccessText: 'text-[#6ee7a8]!',
    formFieldErrorText: 'text-[#ff7a7a]!',
  },
}
