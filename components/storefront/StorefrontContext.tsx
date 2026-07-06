'use client'

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react'
import type { BrandingConfig, StorefrontPublicConfig, StorefrontProductItem } from '@/lib/types/storefront'

// ── Cart ──

interface CartItem {
  storefrontProductId: string
  name: string
  sku: string | null
  dose: string | null
  retailPrice: number
  quantity: number
  image?: string
}

interface CartState {
  items: CartItem[]
  isOpen: boolean
}

type CartAction =
  | { type: 'ADD_ITEM'; item: CartItem }
  | { type: 'REMOVE_ITEM'; storefrontProductId: string }
  | { type: 'UPDATE_QTY'; storefrontProductId: string; quantity: number }
  | { type: 'CLEAR' }
  | { type: 'TOGGLE_DRAWER' }
  | { type: 'SET_ITEMS'; items: CartItem[] }

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find(
        (i) => i.storefrontProductId === action.item.storefrontProductId
      )
      if (existing) {
        return {
          ...state,
          isOpen: true,
          items: state.items.map((i) =>
            i.storefrontProductId === action.item.storefrontProductId
              ? { ...i, quantity: i.quantity + action.item.quantity }
              : i
          ),
        }
      }
      return { ...state, isOpen: true, items: [...state.items, action.item] }
    }
    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter((i) => i.storefrontProductId !== action.storefrontProductId),
      }
    case 'UPDATE_QTY':
      return {
        ...state,
        items: state.items.map((i) =>
          i.storefrontProductId === action.storefrontProductId
            ? { ...i, quantity: Math.max(1, action.quantity) }
            : i
        ),
      }
    case 'CLEAR':
      return { ...state, items: [] }
    case 'TOGGLE_DRAWER':
      return { ...state, isOpen: !state.isOpen }
    case 'SET_ITEMS':
      return { ...state, items: action.items }
    default:
      return state
  }
}

// ── End Customer Auth ──

interface EndCustomerSession {
  token: string
  email: string
}

// ── Context ──

interface StorefrontContextValue {
  config: StorefrontPublicConfig | null
  slug: string
  cart: CartState
  addToCart: (item: CartItem) => void
  removeFromCart: (storefrontProductId: string) => void
  updateQuantity: (storefrontProductId: string, quantity: number) => void
  clearCart: () => void
  toggleCartDrawer: () => void
  cartSubtotal: number
  cartItemCount: number
  session: EndCustomerSession | null
  setSession: (s: EndCustomerSession | null) => void
}

const StorefrontContext = createContext<StorefrontContextValue | null>(null)

export function useStorefront() {
  const ctx = useContext(StorefrontContext)
  if (!ctx) throw new Error('useStorefront must be used within StorefrontProvider')
  return ctx
}

export function StorefrontProvider({
  children,
  config,
  slug,
}: {
  children: ReactNode
  config: StorefrontPublicConfig | null
  slug: string
}) {
  const storageKey = `sf-cart-${slug}`
  const sessionKey = `sf-session-${slug}`

  const [cart, dispatch] = useReducer(cartReducer, { items: [], isOpen: false })
  const [session, setSessionState] = useState<EndCustomerSession | null>(null)

  // Hydrate cart from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) dispatch({ type: 'SET_ITEMS', items: JSON.parse(saved) })
    } catch {}
  }, [storageKey])

  // Persist cart
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(cart.items))
    } catch {}
  }, [cart.items, storageKey])

  // Hydrate session
  useEffect(() => {
    try {
      const saved = localStorage.getItem(sessionKey)
      if (saved) setSessionState(JSON.parse(saved))
    } catch {}
  }, [sessionKey])

  const setSession = useCallback(
    (s: EndCustomerSession | null) => {
      setSessionState(s)
      try {
        if (s) localStorage.setItem(sessionKey, JSON.stringify(s))
        else localStorage.removeItem(sessionKey)
      } catch {}
    },
    [sessionKey]
  )

  // Memoize so the whole storefront tree only re-renders when cart/session/
  // config actually change, not on every StorefrontProvider render.
  const value = useMemo<StorefrontContextValue>(() => {
    // Skip items without a valid price (e.g. stale localStorage carts) so the
    // subtotal never becomes NaN and renders as "$NaN".
    const cartSubtotal = cart.items.reduce(
      (s, i) =>
        typeof i.retailPrice === 'number' && Number.isFinite(i.retailPrice)
          ? s + i.retailPrice * i.quantity
          : s,
      0
    )
    const cartItemCount = cart.items.reduce((s, i) => s + i.quantity, 0)
    return {
      config,
      slug,
      cart,
      addToCart: (item) => dispatch({ type: 'ADD_ITEM', item }),
      removeFromCart: (id) => dispatch({ type: 'REMOVE_ITEM', storefrontProductId: id }),
      updateQuantity: (id, qty) =>
        dispatch({ type: 'UPDATE_QTY', storefrontProductId: id, quantity: qty }),
      clearCart: () => dispatch({ type: 'CLEAR' }),
      toggleCartDrawer: () => dispatch({ type: 'TOGGLE_DRAWER' }),
      cartSubtotal,
      cartItemCount,
      session,
      setSession,
    }
  }, [config, slug, cart, session, setSession])

  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>
}

