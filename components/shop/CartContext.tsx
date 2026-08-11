'use client'

import { createContext, useContext, useReducer, useEffect, useMemo, useRef, ReactNode } from 'react'
import { toast } from 'sonner'

import { BACKORDER_MIN_QUANTITY } from '@/lib/shop/backorder'

/** Maximum vials of a single product per order. */
export const MAX_ITEM_QUANTITY = 100

function clampQuantity(quantity: number, minQty = 1): number {
  return Math.min(Math.max(minQty, Math.floor(quantity)), MAX_ITEM_QUANTITY)
}

export interface CartItem {
  id: string
  productId: string
  name: string
  dose: string
  sku: string
  price: number
  quantity: number
  image?: string
  /** True when the line was added while the SKU had zero sellable stock. */
  isBackorder?: boolean
}

interface CartState {
  items: CartItem[]
  isOpen: boolean
}

type CartAction =
  | { type: 'ADD_ITEM'; payload: Omit<CartItem, 'quantity'> & { quantity?: number } }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'UPDATE_QUANTITY'; payload: { id: string; quantity: number } }
  | { type: 'CLEAR_CART' }
  | { type: 'TOGGLE_CART' }
  | { type: 'OPEN_CART' }
  | { type: 'CLOSE_CART' }
  | { type: 'LOAD_CART'; payload: CartItem[] }
  | { type: 'REFRESH_PRICES'; payload: { sku: string; price: number }[] }

interface CartContextType {
  items: CartItem[]
  isOpen: boolean
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart: () => void
  toggleCart: () => void
  openCart: () => void
  closeCart: () => void
  totalItems: number
  subtotal: number
}

const CartContext = createContext<CartContextType | undefined>(undefined)

const CART_STORAGE_KEY = 'peptsci-cart'

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existingItem = state.items.find((item) => item.id === action.payload.id)
      const isBackorder = Boolean(action.payload.isBackorder ?? existingItem?.isBackorder)
      const minQty = isBackorder ? BACKORDER_MIN_QUANTITY : 1
      if (existingItem) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === action.payload.id
              ? {
                  ...item,
                  isBackorder: item.isBackorder || action.payload.isBackorder,
                  quantity: clampQuantity(
                    item.quantity + (action.payload.quantity || minQty),
                    item.isBackorder || action.payload.isBackorder ? BACKORDER_MIN_QUANTITY : 1
                  ),
                }
              : item
          ),
        }
      }
      return {
        ...state,
        items: [
          ...state.items,
          {
            ...action.payload,
            isBackorder,
            quantity: clampQuantity(action.payload.quantity || minQty, minQty),
          },
        ],
      }
    }
    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.payload),
      }
    case 'UPDATE_QUANTITY': {
      const target = state.items.find((item) => item.id === action.payload.id)
      const minQty = target?.isBackorder ? BACKORDER_MIN_QUANTITY : 1
      // Drop the line when qty falls below the line minimum (1, or 20 for backorder).
      if (action.payload.quantity < minQty) {
        return {
          ...state,
          items: state.items.filter((item) => item.id !== action.payload.id),
        }
      }
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.payload.id
            ? {
                ...item,
                quantity: clampQuantity(
                  action.payload.quantity,
                  item.isBackorder ? BACKORDER_MIN_QUANTITY : 1
                ),
              }
            : item
        ),
      }
    }
    case 'CLEAR_CART':
      return { ...state, items: [] }
    case 'TOGGLE_CART':
      return { ...state, isOpen: !state.isOpen }
    case 'OPEN_CART':
      return { ...state, isOpen: true }
    case 'CLOSE_CART':
      return { ...state, isOpen: false }
    case 'LOAD_CART':
      return {
        ...state,
        items: action.payload.map((item) => {
          const minQty = item.isBackorder ? BACKORDER_MIN_QUANTITY : 1
          return {
            ...item,
            isBackorder: Boolean(item.isBackorder),
            quantity: clampQuantity(item.quantity, minQty),
          }
        }),
      }
    case 'REFRESH_PRICES': {
      const priceBySku = new Map(action.payload.map((p) => [p.sku, p.price]))
      return {
        ...state,
        items: state.items.map((item) => {
          const fresh = priceBySku.get(item.sku)
          return fresh != null && fresh !== item.price ? { ...item, price: fresh } : item
        }),
      }
    }
    default:
      return state
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], isOpen: false })

  // Load cart from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(CART_STORAGE_KEY)
    if (stored) {
      try {
        const items = JSON.parse(stored)
        dispatch({ type: 'LOAD_CART', payload: items })
      } catch (e) {
        console.error('Failed to load cart from storage:', e)
      }
    }
  }, [])

  // Save cart to localStorage on change
  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.items))
  }, [state.items])

  // Revalidate persisted prices once per session: a cart restored from
  // localStorage can carry stale custom pricing. Checkout always re-prices
  // server-side; this keeps the DISPLAYED numbers honest too.
  const revalidatedRef = useRef(false)
  useEffect(() => {
    if (revalidatedRef.current || state.items.length === 0) return
    revalidatedRef.current = true
    const skus = Array.from(new Set(state.items.map((i) => i.sku).filter(Boolean)))
    if (skus.length === 0) return
    fetch('/api/shop/cart/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.lines) return
        const updates = (
          data.lines as { sku: string; unitPrice: number | null; available: boolean }[]
        )
          .filter((l) => l.available && l.unitPrice != null)
          .map((l) => ({ sku: l.sku, price: l.unitPrice as number }))
        const changed = updates.some((u) => {
          const item = state.items.find((i) => i.sku === u.sku)
          return item && item.price !== u.price
        })
        if (changed) {
          dispatch({ type: 'REFRESH_PRICES', payload: updates })
          toast.info('Cart prices were updated to your current pricing.')
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.items.length])

  // Memoize the context value so consumers (the whole shop tree) only re-render
  // when the cart contents or open state actually change — not on every render
  // of CartProvider. `dispatch` is stable, so the handlers can be created once.
  const value = useMemo<CartContextType>(() => {
    const totalItems = state.items.reduce((sum, item) => sum + item.quantity, 0)
    const subtotal = state.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    return {
      items: state.items,
      isOpen: state.isOpen,
      addItem: (item) => dispatch({ type: 'ADD_ITEM', payload: item }),
      removeItem: (id) => dispatch({ type: 'REMOVE_ITEM', payload: id }),
      updateQuantity: (id, quantity) => dispatch({ type: 'UPDATE_QUANTITY', payload: { id, quantity } }),
      clearCart: () => dispatch({ type: 'CLEAR_CART' }),
      toggleCart: () => dispatch({ type: 'TOGGLE_CART' }),
      openCart: () => dispatch({ type: 'OPEN_CART' }),
      closeCart: () => dispatch({ type: 'CLOSE_CART' }),
      totalItems,
      subtotal,
    }
  }, [state.items, state.isOpen])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}

/** Safe outside CartProvider — returns empty cart state (admin catalog cards). */
export function useOptionalCart(): Pick<CartContextType, 'items'> {
  const context = useContext(CartContext)
  return context ?? { items: [] }
}
