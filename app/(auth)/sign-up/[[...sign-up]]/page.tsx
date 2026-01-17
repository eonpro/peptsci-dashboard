import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="flex justify-center">
      <SignUp
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
