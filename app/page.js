'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Login from '@/components/Login'

export default function HomePage() {
  const router = useRouter()
  const requireAuth = process.env.NEXT_PUBLIC_REQUIRE_AUTH !== 'false'

  useEffect(() => {
    if (!requireAuth) {
      router.push('/dashboard')
    }
  }, [router, requireAuth])

  if (requireAuth) {
    return <Login />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">Redirection vers le dashboard...</p>
      </div>
    </div>
  )
}

