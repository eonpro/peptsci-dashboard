'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { 
  User, 
  Building2, 
  Mail, 
  Phone, 
  MapPin, 
  Shield, 
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock
} from 'lucide-react'

// Mock user data
const userData = {
  firstName: 'John',
  lastName: 'Smith',
  email: 'john@abcmedical.com',
  phone: '(555) 123-4567',
  company: 'ABC Medical Clinic',
  licenseNumber: 'CA-MED-123456',
  licenseExpiry: '2027-06-30',
  accountStatus: 'approved',
  memberSince: '2024-06-15',
  addresses: [
    {
      id: 1,
      type: 'shipping',
      default: true,
      address1: '123 Healthcare Blvd',
      address2: 'Suite 100',
      city: 'Los Angeles',
      state: 'California',
      zip: '90001',
    },
    {
      id: 2,
      type: 'billing',
      default: true,
      address1: '456 Finance Ave',
      address2: '',
      city: 'Los Angeles',
      state: 'California',
      zip: '90002',
    },
  ],
}

const statusConfig = {
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  pending: { label: 'Pending Approval', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  rejected: { label: 'Not Approved', color: 'bg-red-100 text-red-700', icon: AlertCircle },
}

export default function AccountPage() {
  const status = statusConfig[userData.accountStatus as keyof typeof statusConfig]
  const StatusIcon = status.icon

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">My Account</h1>
        <p className="text-gray-500 mt-1">Manage your account settings and preferences</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
              <CardDescription>
                Update your personal details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" defaultValue={userData.firstName} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" defaultValue={userData.lastName} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" defaultValue={userData.email} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" type="tel" defaultValue={userData.phone} />
                </div>
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>

          {/* Business Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Business Information
              </CardTitle>
              <CardDescription>
                Your organization and license details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company">Company / Organization</Label>
                <Input id="company" defaultValue={userData.company} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="license">License Number</Label>
                  <Input id="license" defaultValue={userData.licenseNumber} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiry">License Expiry</Label>
                  <Input id="expiry" defaultValue={userData.licenseExpiry} disabled />
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                <FileText className="h-4 w-4" />
                <span>To update license information, please contact support.</span>
              </div>
            </CardContent>
          </Card>

          {/* Addresses */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Addresses
                  </CardTitle>
                  <CardDescription>
                    Manage your shipping and billing addresses
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm">
                  Add Address
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {userData.addresses.map((address) => (
                  <div 
                    key={address.id} 
                    className="p-4 border rounded-xl space-y-2 hover:border-indigo-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="capitalize">
                        {address.type}
                      </Badge>
                      {address.default && (
                        <Badge variant="secondary" className="text-xs">
                          Default
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      <p>{address.address1}</p>
                      {address.address2 && <p>{address.address2}</p>}
                      <p>{address.city}, {address.state} {address.zip}</p>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button variant="ghost" size="sm" className="text-xs">
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs text-red-500">
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Account Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Account Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${status.color.split(' ')[0]}`}>
                  <StatusIcon className={`h-5 w-5 ${status.color.split(' ')[1]}`} />
                </div>
                <div>
                  <Badge className={status.color}>{status.label}</Badge>
                  <p className="text-xs text-gray-500 mt-1">
                    Member since {new Date(userData.memberSince).toLocaleDateString('en-US', { 
                      month: 'long', 
                      year: 'numeric' 
                    })}
                  </p>
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Orders Placed</span>
                  <span className="font-medium">24</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Spent</span>
                  <span className="font-medium">$12,450.00</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="ghost" className="w-full justify-start" asChild>
                <Link href="/shop/orders">
                  <FileText className="mr-2 h-4 w-4" />
                  Order History
                </Link>
              </Button>
              <Button variant="ghost" className="w-full justify-start">
                <Mail className="mr-2 h-4 w-4" />
                Email Preferences
              </Button>
              <Button variant="ghost" className="w-full justify-start">
                <Shield className="mr-2 h-4 w-4" />
                Security Settings
              </Button>
            </CardContent>
          </Card>

          {/* Support */}
          <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
            <CardContent className="pt-6 text-center">
              <Phone className="h-10 w-10 text-indigo-600 mx-auto mb-3" />
              <h3 className="font-medium text-gray-900">Need Assistance?</h3>
              <p className="text-sm text-gray-600 mt-1 mb-4">
                Our team is available Mon-Fri 9am-5pm PST
              </p>
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700">
                Contact Support
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
