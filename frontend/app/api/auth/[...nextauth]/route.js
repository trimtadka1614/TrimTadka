import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app';

const authOptions = {
  providers: [
    CredentialsProvider({
      id: 'customer-login',
      name: 'Customer Login',
      credentials: {
        customer_ph_number: { label: 'Phone Number', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          console.log('Attempting customer login with:', {
            phone: credentials.customer_ph_number,
            apiUrl: `${API_BASE_URL}/signin_customer`
          });

          const res = await fetch(`${API_BASE_URL}/signin_customer`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              customer_ph_number: credentials.customer_ph_number,
              password: credentials.password,
            }),
          });

          console.log('Customer login response status:', res.status);

          const contentType = res.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            const textResponse = await res.text();
            console.error('Non-JSON response received:', textResponse);
            throw new Error('Server returned an invalid response format for customer login');
          }

          const data = await res.json();
          console.log('Customer login response data:', data);

          if (res.ok && data.token) {
            return {
              id: data.customer.id,
              name: data.customer.name,
              phone: data.customer.phone,
              role: 'customer',
              accessToken: data.token,
            };
          } else {
            throw new Error(data.message || 'Customer authentication failed');
          }
        } catch (error) {
          console.error('Customer login error in authorize:', error);
          throw new Error(error.message || 'Failed to connect to the authentication server for customer.');
        }
      },
    }),
    CredentialsProvider({
      id: 'shop-login',
      name: 'Shop Login',
      credentials: {
        ph_number: { label: 'Phone Number', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          console.log('Attempting shop login with:', {
            phone: credentials.ph_number,
            apiUrl: `${API_BASE_URL}/signin_shop`
          });

          const res = await fetch(`${API_BASE_URL}/signin_shop`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              ph_number: credentials.ph_number,
              password: credentials.password,
            }),
          });

          console.log('Shop login response status:', res.status);

          const contentType = res.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            const textResponse = await res.text();
            console.error('Non-JSON response received for shop login:', textResponse);
            throw new Error('Server returned an invalid response format for shop login');
          }

          const data = await res.json();
          console.log('Shop login response data:', data); // IMPORTANT: Check this log for `is_active`!

          if (res.ok && data.token) {
            // **CRITICAL FIXES HERE:**
            // 1. Backend returns `shop.id` for `shop_id`. Use `data.shop.id`.
            // 2. Add `is_active: data.shop.is_active`.
            return {
              id: data.shop.id, // This is your shop_id as returned by backend
              name: data.shop.name,
              phone: data.shop.phone,
              role: 'shop',
              accessToken: data.token,
              shop_id: data.shop.id, // Use data.shop.id as it contains the shop_id
              is_active: data.shop.is_active, // <--- ADDED THIS LINE!
            };
          } else {
            throw new Error(data.message || 'Shop authentication failed');
          }
        } catch (error) {
          console.error('Shop login error in authorize:', error);
          throw new Error(error.message || 'Failed to connect to the authentication server for shop.');
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.phone = user.phone;
        token.accessToken = user.accessToken;
        // **CRITICAL FIXES HERE:**
        // Propagate shop_id and is_active from the user object (returned by authorize)
        if (user.role === 'shop') { // No need to check user.shop_id here, it should always be present for a 'shop' role
          token.shop_id = user.shop_id;
          token.is_active = user.is_active; // <--- ADDED THIS LINE!
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.name = token.name; // Make sure name is populated for session.user.name
      session.user.email = token.email; // Make sure email is populated for session.user.email if needed
      session.user.role = token.role;
      session.user.phone = token.phone;
      session.accessToken = token.accessToken;
      // **CRITICAL FIXES HERE:**
      // Propagate shop_id and is_active from the token
      if (token.role === 'shop') { // No need to check token.shop_id here, it should always be present for a 'shop' role
        session.user.shop_id = token.shop_id;
        session.user.is_active = token.is_active; // <--- ADDED THIS LINE!
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
  pages: {
    signIn: '/',
    error: '/',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  jwt: {
    secret: process.env.NEXTAUTH_SECRET,
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
