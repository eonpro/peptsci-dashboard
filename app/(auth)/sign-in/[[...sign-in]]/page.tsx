import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="flex justify-center">
      <SignIn
        appearance={{
          elements: {
            rootBox: 'max-w-md w-full',
            card: 'bg-white/90 shadow-xl border border-white/70 rounded-[20px]',
          },
        }}
      />
    </div>
  )
}
