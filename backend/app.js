const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const haversine = require("haversine-distance");
const dayjs = require('dayjs'); // For easy time manipulation
const utc = require('dayjs/plugin/utc'); // Import UTC plugin
const timezone = require('dayjs/plugin/timezone'); // Import Timezone plugin
dayjs.extend(utc); // Extend dayjs with UTC plugin
dayjs.extend(timezone); // Extend dayjs with Timezone plugin

require('dotenv').config(); // Load environment variables from .env file
const webpush = require('web-push'); // Added for push notifications

// Define the IST timezone
const IST_TIMEZONE = 'Asia/Kolkata';

// Initialize Express app
const app = express();
// Vercel automatically assigns a port, so we don't need to explicitly listen on one.
// The PORT environment variable is set by Vercel.
const port = process.env.PORT || 3000; 

// CORS middleware to allow requests from Hoppscotch web and Vercel frontend
app.use((req, res, next) => {
    // Allow requests from any origin for now. In production, you might want to restrict this
    // to your specific frontend domain (e.g., 'https://your-frontend-domain.vercel.app').
    res.header('Access-Control-Allow-Origin', '*'); 
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Middleware to parse JSON request bodies
app.use(express.json());

// Database connection pool configuration
// Ensure your .env file has DATABASE_URL and JWT_SECRET
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Explicitly set SSL options for Vercel deployment.
    // `rejectUnauthorized: false` is often needed when connecting to external databases
    // like Supabase from Vercel, as Vercel's environment might not trust the CA.
    ssl: {
        rejectUnauthorized: false 
    }
});

// CRITICAL ADDITION: Add an error listener to the pool
// This catches errors emitted by idle clients in the pool,
// preventing your Node.js process from crashing on unhandled 'error' events.
pool.on('error', (err, client) => {
    console.error('FATAL: Unexpected error on idle PostgreSQL client:', err);
    // The client that caused the error will be automatically removed from the pool.
    // A new client will be created on the next request.
    // You typically do NOT want to call process.exit() here, as it would crash your app
    // on any database connection hiccup.
});

// Test database connection with better error handling
pool.connect(async (err, client, release) => { // Made async to use await
    if (err) {
        // Provide more specific guidance for ETIMEDOUT errors
        if (err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
            console.error('Database connection failed: ETIMEDOUT or ENOTFOUND. This usually means:');
            console.error('1. Your DATABASE_URL in .env might be incorrect or have typos.');
            console.error('2. Your network/firewall might be blocking the connection to your database.');
            console.error('3. Your database IP allowlisting might be enabled, and Vercel\'s IP is not whitelisted.');
            console.error('Please check your .env file and database project settings.');
            console.error('Expected format: postgresql://user:password@host:port/database');
        }
        return console.error('Error acquiring client:', err.stack);
    }
    try {
        console.log('Successfully connected to the database!');
    } finally {
        release(); // Release the client back to the pool
    }
});

// Secret key for JWT token generation.
// IMPORTANT: Use a strong, unique secret in production and keep it secure.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('JWT_SECRET is not defined in environment variables. Please set it.');
    // In a serverless environment like Vercel, process.exit(1) might not be ideal
    // for every error, but for a critical missing env var, it's acceptable.
    process.exit(1); 
}

// Middleware to verify JWT token (for protected routes)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) {
        return res.status(401).json({ message: 'Authentication token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid or expired token' });
        }
        req.user = user; // Attach user payload to request object
        next();
    });
};

// Utility function to calculate estimated wait time (this function is not directly used in the provided code, but kept for context)
function calculateWaitTime(queue, durations) {
    return queue.reduce((sum, booking) => {
        return sum + (booking.service_duration_minutes || 0);
    }, 0);
}

// VAPID keys for push notifications
// IMPORTANT: Replace with your actual VAPID keys from environment variables
const vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
};

// Set VAPID details for webpush. Ensure 'mailto:' is included.
webpush.setVapidDetails(
    'mailto:sourjya1614@gmail.com', // Replace with your actual email or a mailto: URL
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

// Utility function to send push notifications to customers
async function sendNotificationToCustomer(customerId, payload) {
  try {
    const result = await pool.query(
      `SELECT subscription_data FROM push_subscriptions WHERE customer_id = $1`,
      [customerId]
    );

    if (result.rows.length === 0) {
      console.log(`No push subscription found for customer ${customerId}.`);
      return;
    }

    const subscription = result.rows[0].subscription_data;
    if (!subscription || !subscription.endpoint) {
      console.error(`Invalid subscription data for customer ${customerId}:`, subscription);
      return;
    }

    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      console.log(`Push notification sent to customer ${customerId}.`);
    } catch (error) {
      console.error(`Error sending push notification to customer ${customerId}:`, error);
      if (error.statusCode === 410) {
        console.log(`Subscription for customer ${customerId} expired. Removing from DB.`);
        await pool.query(
          `DELETE FROM push_subscriptions WHERE customer_id = $1`,
          [customerId]
        );
      }
    }
  } catch (dbError) {
    console.error(`Database error while fetching subscription for customer ${customerId}:`, dbError);
  }
}

// Utility function to send push notifications to shops
async function sendNotificationToShop(shopId, payload) {
    try {
        const result = await pool.query(
            `SELECT subscription_data FROM shop_push_subscriptions WHERE shop_id = $1`,
            [shopId]
        );

        if (result.rows.length === 0) {
            console.log(`No push subscription found for shop ${shopId}.`);
            return;
        }

        const subscription = result.rows[0].subscription_data;
        if (!subscription || !subscription.endpoint) {
            console.error(`Invalid subscription data for shop ${shopId}:`, subscription);
            return;
        }

        try {
            await webpush.sendNotification(subscription, JSON.stringify(payload));
            console.log(`Push notification sent to shop ${shopId}.`);
        } catch (error) {
            console.error(`Error sending push notification to shop ${shopId}:`, error);
            if (error.statusCode === 410) {
                console.log(`Subscription for shop ${shopId} expired. Removing from DB.`);
                await pool.query(
                    `DELETE FROM shop_push_subscriptions WHERE shop_id = $1`,
                    [shopId]
                );
            }
        }
    } catch (dbError) {
        console.error(`Database error while fetching subscription for shop ${shopId}:`, dbError);
    }
}

// Customer Push Notification Routes
app.post('/subscribe', async (req, res) => {
  const { customerId, subscription } = req.body;

  if (!customerId || !subscription) {
    return res.status(400).json({ error: 'Customer ID and subscription data are required.' });
  }

  try {
    const existingSubscription = await pool.query(
      `SELECT * FROM push_subscriptions WHERE customer_id = $1`,
      [customerId]
    );

    if (existingSubscription.rows.length > 0) {
      // Update existing subscription and set updated_at
      await pool.query(
        `UPDATE push_subscriptions SET subscription_data = $1, updated_at = CURRENT_TIMESTAMP WHERE customer_id = $2`,
        [subscription, customerId]
      );
      console.log(`Updated push subscription for customer ${customerId}.`);
      return res.status(200).json({ message: 'Subscription updated successfully.' });
    } else {
      // Insert new subscription; created_at will use DEFAULT CURRENT_TIMESTAMP
      await pool.query(
        `INSERT INTO push_subscriptions (customer_id, subscription_data) VALUES ($1, $2)`,
        [customerId, subscription]
      );
      console.log(`New push subscription added for customer ${customerId}.`);
      return res.status(201).json({ message: 'Subscription added successfully.' });
    }
  } catch (error) {
    console.error('Error handling customer subscription:', error);
    res.status(500).json({ error: 'Failed to handle customer subscription.' });
  }
});

app.post('/unsubscribe', async (req, res) => {
  const { customerId } = req.body;

  if (!customerId) {
    return res.status(400).json({ error: 'Customer ID is required.' });
  }

  try {
    const result = await pool.query(
      `DELETE FROM push_subscriptions WHERE customer_id = $1`,
      [customerId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'No subscription found for this customer.' });
    }

    console.log(`Unsubscribed customer ${customerId}.`);
    res.status(200).json({ message: 'Unsubscribed successfully.' });
  } catch (error) {
    console.error('Error handling customer unsubscription:', error);
    res.status(500).json({ error: 'Failed to handle customer unsubscription.' });
  }
});

app.get('/customers/:customerId/subscription-status', async (req, res) => {
  const { customerId } = req.params;

  if (!customerId) {
    return res.status(400).json({ error: 'Customer ID is required.' });
  }

  try {
    const result = await pool.query(
      `SELECT COUNT(*) FROM push_subscriptions WHERE customer_id = $1`,
      [customerId]
    );

    const isSubscribed = parseInt(result.rows[0].count) > 0;
    res.status(200).json({ isSubscribed });
  } catch (error) {
    console.error('Error checking customer subscription status:', error);
    res.status(500).json({ error: 'Failed to check customer subscription status.' });
  }
});

// Shop Push Notification Routes
app.post('/shop/subscribe', async (req, res) => {
    const { shopId, subscription } = req.body;

    if (!shopId || !subscription) {
        return res.status(400).json({ error: 'Shop ID and subscription data are required.' });
    }

    try {
        const existingSubscription = await pool.query(
            `SELECT * FROM shop_push_subscriptions WHERE shop_id = $1`,
            [shopId]
        );

        if (existingSubscription.rows.length > 0) {
            // Update existing subscription and set updated_at
            await pool.query(
                `UPDATE shop_push_subscriptions SET subscription_data = $1, updated_at = CURRENT_TIMESTAMP WHERE shop_id = $2`,
                [subscription, shopId]
            );
            console.log(`Updated push subscription for shop ${shopId}.`);
            return res.status(200).json({ message: 'Shop subscription updated successfully.' });
        } else {
            // Insert new subscription; created_at will use DEFAULT CURRENT_TIMESTAMP
            await pool.query(
                `INSERT INTO shop_push_subscriptions (shop_id, subscription_data) VALUES ($1, $2)`,
                [shopId, subscription]
            );
            console.log(`New push subscription added for shop ${shopId}.`);
            return res.status(201).json({ message: 'Shop subscription added successfully.' });
        }
    } catch (error) {
        console.error('Error handling shop subscription:', error);
        res.status(500).json({ error: 'Failed to handle shop subscription.' });
    }
});

app.post('/shop/unsubscribe', async (req, res) => {
    const { shopId } = req.body;

    if (!shopId) {
        return res.status(400).json({ error: 'Shop ID is required.' });
    }

    try {
        const result = await pool.query(
            `DELETE FROM push_subscriptions WHERE shop_id = $1`,
            [shopId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'No subscription found for this shop.' });
        }

        console.log(`Unsubscribed shop ${shopId}.`);
        res.status(200).json({ message: 'Shop unsubscribed successfully.' });
    } catch (error) {
        console.error('Error handling shop unsubscription:', error);
        res.status(500).json({ error: 'Failed to handle shop unsubscription.' });
    }
});

app.get('/shops/:shopId/subscription-status', async (req, res) => {
    const { shopId } = req.params;

    if (!shopId) {
        return res.status(400).json({ error: 'Shop ID is required.' });
    }

    try {
        const result = await pool.query(
            `SELECT COUNT(*) FROM shop_push_subscriptions WHERE shop_id = $1`,
            [shopId]
        );

        const isSubscribed = parseInt(result.rows[0].count) > 0;
        res.status(200).json({ isSubscribed });
    } catch (error) {
        console.error('Error checking shop subscription status:', error);
        res.status(500).json({ error: 'Failed to check shop subscription status.' });
    }
});


// --- ROUTES ---

// 1. Customer Sign-Up Route
app.post('/signup_customer', async (req, res) => {
    const { customer_name, customer_ph_number, password } = req.body;

    // Basic validation
    if (!customer_name || !customer_ph_number || !password) {
        return res.status(400).json({ message: 'All fields are required: customer_name, customer_ph_number, and password.' });
    }

    try {
        // Hash the password before storing it
        const hashedPassword = await bcrypt.hash(password, 10); // Salt rounds: 10

        // Check if customer with this phone number already exists
        const checkExisting = await pool.query(
            'SELECT customer_id FROM customers WHERE customer_ph_number = $1',
            [customer_ph_number]
        );

        if (checkExisting.rows.length > 0) {
            return res.status(409).json({ message: 'Customer with this phone number already exists.' });
        }

        // Insert new customer into the database
        const result = await pool.query(
            'INSERT INTO customers (customer_name, customer_ph_number, password) VALUES ($1, $2, $3) RETURNING customer_id, customer_name, customer_ph_number',
            [customer_name, customer_ph_number, hashedPassword]
        );

        const newCustomer = result.rows[0];
        // Generate a JWT token for the newly signed-up customer
        const token = jwt.sign(
            { id: newCustomer.customer_id, role: 'customer', phone: newCustomer.customer_ph_number },
            JWT_SECRET,
            { expiresIn: '24h' } // Token expires in 24 hours
        );

        res.status(201).json({
            message: 'Customer signed up successfully!',
            customer: {
                id: newCustomer.customer_id,
                name: newCustomer.customer_name,
                phone: newCustomer.customer_ph_number
            },
            token
        });

    } catch (error) {
        console.error('Error during customer sign-up:', error);
        res.status(500).json({ message: 'Internal server error during sign-up.' });
    }
});

// 2. Customer Sign-In Route
app.post('/signin_customer', async (req, res) => {
    const { customer_ph_number, password } = req.body;

    // Basic validation
    if (!customer_ph_number || !password) {
        return res.status(400).json({ message: 'Phone number and password are required.' });
    }

    try {
        // Retrieve customer by phone number
        const result = await pool.query(
            'SELECT customer_id, customer_name, password FROM customers WHERE customer_ph_number = $1',
            [customer_ph_number]
        );

        const customer = result.rows[0];

        // Check if customer exists
        if (!customer) {
            return res.status(401).json({ message: 'Invalid phone number or password.' });
        }

        // Compare provided password with hashed password from database
        const isPasswordValid = await bcrypt.compare(password, customer.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid phone number or password.' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: customer.customer_id, role: 'customer', phone: customer_ph_number },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(200).json({
            message: 'Customer signed in successfully!',
            customer: {
                id: customer.customer_id,
                name: customer.customer_name,
                phone: customer_ph_number
            },
            token
        });

    } catch (error) {
        console.error('Error during customer sign-in:', error);
        res.status(500).json({ message: 'Internal server error during sign-in.' });
    }
});



// 3. Shop Sign-Up Route
app.post('/signup_shop', async (req, res) => {
    const { shop_name, lat, long, address, ph_number, password } = req.body;

    // Basic validation for required fields
    if (!shop_name || !ph_number || !password) {
        return res.status(400).json({ message: 'Shop name, phone number, and password are required.' });
    }

    try {
        // Hash the password for security
        const hashedPassword = await bcrypt.hash(password, 10);

        // Check if a shop with this phone number already exists to prevent duplicates
        const checkExisting = await pool.query(
            'SELECT shop_id FROM shops WHERE ph_number = $1',
            [ph_number]
        );

        if (checkExisting.rows.length > 0) {
            // If a shop with the phone number exists, return a conflict error
            return res.status(409).json({ message: 'Shop with this phone number already exists.' });
        }

        // Insert new shop into the database, explicitly setting is_active to TRUE
        // The 'is_active' column is set to true by default for new sign-ups.
        const result = await pool.query(
            'INSERT INTO shops (shop_name, lat, long, address, ph_number, password, is_active) VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING shop_id, shop_name, ph_number, is_active',
            [shop_name, lat, long, address, ph_number, hashedPassword]
        );

        const newShop = result.rows[0];

        // Generate a JWT token for the newly signed-up shop for authentication
        const token = jwt.sign(
            { id: newShop.shop_id, role: 'shop', phone: newShop.ph_number },
            JWT_SECRET,
            { expiresIn: '24h' } // Token expires in 24 hours
        );

        // Respond with success message, new shop details, and the JWT token
        res.status(201).json({
            message: 'Shop signed up successfully!',
            shop: {
                id: newShop.shop_id,
                name: newShop.shop_name,
                phone: newShop.ph_number,
                is_active: newShop.is_active // Reflects the default true status
            },
            token
        });

    } catch (error) {
        // Log any errors that occur during the sign-up process
        console.error('Error during shop sign-up:', error);
        // Return a generic internal server error
        res.status(500).json({ message: 'Internal server error during sign-up.' });
    }
});

// 4. Shop Sign-In Route
app.post('/signin_shop', async (req, res) => {
    const { ph_number, password } = req.body;

    // Basic validation for required fields
    if (!ph_number || !password) {
        return res.status(400).json({ message: 'Phone number and password are required.' });
    }

    try {
        // Retrieve shop by phone number from the database.
        // The 'is_active' status is retrieved as is, and not modified during sign-in.
        const result = await pool.query(
            'SELECT shop_id, shop_name, password, is_active FROM shops WHERE ph_number = $1',
            [ph_number]
        );

        const shop = result.rows[0];

        // Check if shop exists
        if (!shop) {
            // If no shop is found, return an unauthorized error
            return res.status(401).json({ message: 'Invalid phone number or password.' });
        }

        // Compare the provided password with the hashed password stored in the database
        const isPasswordValid = await bcrypt.compare(password, shop.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid phone number or password.' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: shop.shop_id, role: 'shop', phone: ph_number },
            JWT_SECRET,
            { expiresIn: '24h' } // Token expires in 24 hours
        );

        // Respond with success message, shop details (including its current is_active status), and the JWT token
        res.status(200).json({
            message: 'Shop signed in successfully!',
            shop: {
                id: shop.shop_id,
                name: shop.shop_name,
                phone: ph_number,
                is_active: shop.is_active // The 'is_active' status remains unchanged
            },
            token
        });

    } catch (error) {
        // Log any errors that occur during the sign-in process
        console.error('Error during shop sign-in:', error);
        // Return a generic internal server error
        res.status(500).json({ message: 'Internal server error during sign-in.' });
    }
});


// Protected route example (using the authenticateToken middleware)
app.get('/profile', authenticateToken, (req, res) => {
    res.json({
        message: 'This is a protected route',
        user: req.user,
        timestamp: dayjs().tz(IST_TIMEZONE).toISOString() // Formatted to IST
    });
});



app.get('/myshop/:shop_id', async (req, res) => {
    const shopId = req.params.shop_id;

    if (!shopId) {
        return res.status(400).json({ message: 'Shop ID is required.' });
    }

    let client;
    try {
        client = await pool.connect();

        const result = await client.query(
            'SELECT shop_id, shop_name, lat, long, address, ph_number, is_active FROM shops WHERE shop_id = $1',
            [shopId]
        );

        const shop = result.rows[0];

        if (!shop) {
            return res.status(404).json({ message: 'Shop not found.' });
        }

        res.status(200).json({
            message: 'Shop details retrieved successfully.',
            shop: {
                id: shop.shop_id,
                name: shop.shop_name,
                latitude: shop.lat,
                longitude: shop.long,
                address: shop.address,
                phoneNumber: shop.ph_number,
                isActive: shop.is_active
            }
        });

    } catch (error) {
        console.error('Error retrieving shop details:', error);
        res.status(500).json({ message: 'Internal server error while fetching shop details.' });
    } finally {
        if (client) client.release();
    }
});
// Get all active shops (public route)
app.get('/shops', async (req, res) => {
    let client;
    try {
        client = await pool.connect();

        const result = await client.query(
            'SELECT shop_id, shop_name, lat, long, address, ph_number FROM shops WHERE is_active = true ORDER BY shop_name'
        );

        res.status(200).json({
            message: 'Active shops retrieved successfully',
            shops: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('Error fetching shops:', error);
        res.status(500).json({ message: 'Internal server error while fetching shops.' });
    } finally {
        if (client) client.release();
    }
});


// Get shops with detailed barber info & queue status (simplified route)
// Assuming 'pool' is your PostgreSQL connection pool.
// If you're using 'dayjs' and 'haversine' in your backend, ensure they are imported/defined:
// const dayjs = require('dayjs'); // Example if you're using dayjs for formatting dates on the backend
// const haversine = require('haversine'); // Example if you have a haversine implementation

app.get('/shops/simple', async (req, res) => {
    const { customer_id, lat, long } = req.query; // Parameters come from query for GET request

    let client;
    try {
        client = await pool.connect();

        // Base query to get shops with barbers and their services
        // Modified to include is_active status for both shops and employees
        const shopsQuery = `
            SELECT 
                s.shop_id,
                s.shop_name,
                s.lat,
                s.long,
                s.address,
                s.ph_number,
                s.is_active AS shop_is_active, -- Include shop's active status
                e.emp_id,
                e.emp_name,
                e.is_active AS emp_is_active, -- Include employee's active status
                COALESCE(
                    json_agg(
                        CASE 
                            WHEN srv.service_id IS NOT NULL 
                            THEN json_build_object(
                                'service_id', srv.service_id,
                                'service_name', srv.service_name,
                                'service_duration_minutes', srv.service_duration_minutes
                            )
                            ELSE NULL
                        END
                    ) FILTER (WHERE srv.service_id IS NOT NULL),
                    '[]'::json
                ) as services
            FROM shops s
            LEFT JOIN employees e ON s.shop_id = e.shop_id -- Removed e.is_active filter here to get all employees
            LEFT JOIN employee_services es ON e.emp_id = es.emp_id
            LEFT JOIN services srv ON es.service_id = srv.service_id
            -- Removed s.is_active = TRUE from WHERE clause to get all shops, active or inactive
            GROUP BY s.shop_id, s.shop_name, s.lat, s.long, s.address, s.ph_number, s.is_active, e.emp_id, e.emp_name, e.is_active
            ORDER BY s.shop_name, e.emp_name
        `;

        const shopsResult = await client.query(shopsQuery); // Use client here
        
        // Get current and future bookings for queue calculation for all shops
        const currentTime = dayjs().tz(IST_TIMEZONE).toDate(); // Use IST current time
        const bookingsQuery = `
            SELECT 
                b.booking_id,
                b.shop_id,
                b.emp_id,
                b.customer_id,
                b.service_type,
                b.join_time,
                b.end_time,
                b.status,
                b.service_duration_minutes,
                c.customer_name
            FROM bookings b
            JOIN customers c ON b.customer_id = c.customer_id
            WHERE b.status IN ('booked', 'in_service')
            AND b.end_time > $1 -- Consider all active bookings whose end time is in the future
            ORDER BY b.join_time ASC
        `;
        
        const bookingsResult = await client.query(bookingsQuery, [currentTime]); // Use client here
        const bookings = bookingsResult.rows;

        // Group shops data
        const shopsMap = new Map();
        
        shopsResult.rows.forEach(row => {
            if (!shopsMap.has(row.shop_id)) {
                shopsMap.set(row.shop_id, {
                    shop_id: row.shop_id,
                    shop_name: row.shop_name,
                    ph_number: row.ph_number,
                    is_active: row.shop_is_active, // Include shop's active status
                    location: {
                        address: row.address,
                        coordinates: {
                            lat: parseFloat(row.lat) || null,
                            long: parseFloat(row.long) || null
                        }
                    },
                    barbers: []
                });
            }
            
            const shop = shopsMap.get(row.shop_id);
            
            // Add barber if exists and not already added
            if (row.emp_id && !shop.barbers.some(b => b.emp_id === row.emp_id)) {
                const empBookings = bookings.filter(b => b.emp_id === row.emp_id);
                
                // Calculate queue info
                const totalInQueue = empBookings.length; 
                const inServiceBooking = empBookings.find(b => b.status === 'in_service');
                
                // Calculate estimated wait time
                let finalEstimatedWaitTime = 0;
                // Start with current time as the reference point for calculating next available slot (in IST)
                let lastBookingEndTime = dayjs(currentTime).tz(IST_TIMEZONE).toDate(); 

                // Sort all active bookings by join_time to process them sequentially
                const sortedActiveBookings = empBookings
                    .sort((a, b) => dayjs(a.join_time).tz(IST_TIMEZONE).toDate().getTime() - dayjs(b.join_time).tz(IST_TIMEZONE).toDate().getTime());

                for (let i = 0; i < sortedActiveBookings.length; i++) {
                    const booking = sortedActiveBookings[i];
                    const bookingJoinTime = dayjs.tz(booking.join_time, IST_TIMEZONE).toDate();
const bookingEndTime = dayjs.tz(booking.end_time, IST_TIMEZONE).toDate();

                    if (booking.status === 'in_service') {
                        lastBookingEndTime = dayjs(Math.max(lastBookingEndTime.getTime(), bookingEndTime.getTime() + 5 * 60000)).tz(IST_TIMEZONE).toDate(); // Add 5 min buffer
                    } else if (booking.status === 'booked') {
                        const potentialStartTimeAfterPrevious = dayjs(lastBookingEndTime).tz(IST_TIMEZONE).toDate(); 
                        const actualStartTimeForThisBooking = dayjs(Math.max(bookingJoinTime.getTime(), potentialStartTimeAfterPrevious.getTime())).tz(IST_TIMEZONE).toDate();
                        
                        lastBookingEndTime = dayjs(actualStartTimeForThisBooking.getTime() + (booking.service_duration_minutes || 0) * 60000 + 5 * 60000).tz(IST_TIMEZONE).toDate(); // Add 5 min buffer
                    }
                }

                finalEstimatedWaitTime = ((Math.max(0, Math.ceil((lastBookingEndTime.getTime() - currentTime.getTime()) / (1000 * 60))))-330);

                // Find customer's booking if customer_id is provided
                let customerBooking = null;
                let customerQueuePosition = null;
                
                if (customer_id) {
                    customerBooking = empBookings.find(b => 
                        b.customer_id === parseInt(customer_id) && b.status !== 'completed' && b.status !== 'cancelled'
                    );
                    
                    if (customerBooking) {
                        customerQueuePosition = sortedActiveBookings.findIndex(b => 
                            b.booking_id === customerBooking.booking_id
                        ) + 1; // +1 because array indices are 0-based
                    }
                }

                const barber = {
                    emp_id: row.emp_id,
                    emp_name: row.emp_name,
                    is_active: row.emp_is_active, // Include employee's active status
                    services: Array.isArray(row.services) ? row.services : [],
                    queue_info: {
                        total_people_in_queue: totalInQueue, // Now includes in_service and booked
                        queue_position: totalInQueue + 1, // Position in the overall active queue for new bookings
                        estimated_wait_time: finalEstimatedWaitTime > 0 ? `${finalEstimatedWaitTime} mins` : "No wait",
                        current_status: inServiceBooking ? 
                            `Serving ${inServiceBooking.customer_name}` : 
                            (totalInQueue > 0 ? "Ready for next customer" : "Available"),
                        ...(customerQueuePosition !== null && { customer_queue_position: customerQueuePosition }) // Conditionally add customer's specific queue position
                    }
                };

                // Add customer's booking info if exists
                if (customerBooking) {
                    const joinTime = dayjs(customerBooking.join_time).tz(IST_TIMEZONE).toDate(); // Convert to IST
                    const endTime = dayjs(customerBooking.end_time).tz(IST_TIMEZONE).toDate(); // Convert to IST
                    
                    barber.your_booking = {
                        booking_id: customerBooking.booking_id,
                        join_time: dayjs(joinTime).format('HH:mm'),
                        service_duration: `${customerBooking.service_duration_minutes} mins`,
                        expected_end_time: dayjs(endTime).format('HH:mm'),
                        status: customerBooking.status,
                        services: customerBooking.service_type
                    };
                }

                shop.barbers.push(barber);
            }
        });

        // Convert map to array and calculate distances if coordinates provided
        const shops = Array.from(shopsMap.values());
        
        if (lat && long) {
            const userLocation = { latitude: parseFloat(lat), longitude: parseFloat(long) };
            
            shops.forEach(shop => {
                if (shop.location.coordinates.lat && shop.location.coordinates.long) {
                    const shopLocation = {
                        latitude: shop.location.coordinates.lat,
                        longitude: shop.location.coordinates.long
                    };
                    
                    // Ensure haversine function is available (e.g., imported or defined elsewhere)
                    const distance = haversine(userLocation, shopLocation);
                    shop.location.distance_from_you = `${(distance / 1000).toFixed(1)} km`;
                } else {
                    shop.location.distance_from_you = "Distance unavailable";
                }
            });
            
            // Sort by distance (if haversine is implemented)
            shops.sort((a, b) => {
                const distA = parseFloat(a.location.distance_from_you) || Infinity;
                const distB = parseFloat(b.location.distance_from_you) || Infinity;
                return distA - distB;
            });
        }

        res.status(200).json({
            message: 'Shops with barber details retrieved successfully',
            shops: shops,
            total_shops: shops.length,
            user_location_provided: !!(lat && long),
            timestamp: dayjs().tz(IST_TIMEZONE).toISOString() // Formatted to IST
        });

    } catch (error) {
        console.error('Error fetching shops with barber details:', error);
        res.status(500).json({ 
            error: 'Server error while fetching shops with barber details',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (client) client.release();
    }
});


// Get shops with detailed barber info & queue status (renamed to /shop_status and changed to POST)
// Assuming 'pool' is your PostgreSQL connection pool and 'dayjs' and 'haversine' are imported if used.
// Example imports if not already present:
// const dayjs = require('dayjs');
// const haversine = require('haversine'); // You'd need to implement or import this function

app.post('/shop_status', async (req, res) => {
    const { customer_id, lat, long, shop_id } = req.body; // shop_id now comes from body

    let client;
    try {
        client = await pool.connect();

        // Validate shop_id as it's now a primary filter for this route
        if (!shop_id || !Number.isInteger(parseInt(shop_id))) {
            return res.status(400).json({ error: 'shop_id is required and must be a positive integer in the request body.' });
        }
        const parsedShopId = parseInt(shop_id);

        // Base query to get shops with barbers and their services
        // IMPORTANT: Removed is_active filters from WHERE and JOIN clauses
        // to retrieve both active and inactive shops/employees.
        let shopsQuery = `
            SELECT 
                s.shop_id,
                s.shop_name,
                s.lat,
                s.long,
                s.address,
                s.ph_number,
                s.is_active AS shop_is_active, -- Include shop's active status
                e.emp_id,
                e.emp_name,
                e.is_active AS emp_is_active, -- Include employee's active status
                COALESCE(
                    json_agg(
                        CASE 
                            WHEN srv.service_id IS NOT NULL 
                            THEN json_build_object(
                                'service_id', srv.service_id,
                                'service_name', srv.service_name,
                                'service_duration_minutes', srv.service_duration_minutes
                            )
                            ELSE NULL
                        END
                    ) FILTER (WHERE srv.service_id IS NOT NULL),
                    '[]'::json
                ) as services
            FROM shops s
            LEFT JOIN employees e ON s.shop_id = e.shop_id -- Removed e.is_active filter here
            LEFT JOIN employee_services es ON e.emp_id = es.emp_id
            LEFT JOIN services srv ON es.service_id = srv.service_id
            WHERE s.shop_id = $1 -- Removed s.is_active filter here, only filter by shop_id
            GROUP BY s.shop_id, s.shop_name, s.lat, s.long, s.address, s.ph_number, s.is_active, e.emp_id, e.emp_name, e.is_active
            ORDER BY s.shop_name, e.emp_name
        `;

        const shopsResult = await client.query(shopsQuery, [parsedShopId]); // Pass shop_id as parameter

        if (shopsResult.rows.length === 0) {
            return res.status(404).json({ message: 'Shop not found.' });
        }
        
        // Get current and future bookings for queue calculation for the specific shop
        const currentTime = dayjs().tz(IST_TIMEZONE).toDate(); // Use IST current time
        const bookingsQuery = `
            SELECT 
                b.booking_id,
                b.shop_id,
                b.emp_id,
                b.customer_id,
                b.service_type,
                b.join_time,
                b.end_time,
                b.status,
                b.service_duration_minutes,
                c.customer_name
            FROM bookings b
            JOIN customers c ON b.customer_id = c.customer_id
            WHERE b.status IN ('booked', 'in_service')
            AND b.shop_id = $1 -- Filter bookings by shop_id
            AND b.end_time > $2 -- Consider all active bookings whose end time is in the future
            ORDER BY b.join_time ASC
        `;
        
        const bookingsResult = await client.query(bookingsQuery, [parsedShopId, currentTime]); // Pass shop_id and currentTime
        const bookings = bookingsResult.rows;

        // Group shops data (will only be one shop due to shop_id filter)
        const shopsMap = new Map();
        
        shopsResult.rows.forEach(row => {
            if (!shopsMap.has(row.shop_id)) {
                shopsMap.set(row.shop_id, {
                    shop_id: row.shop_id,
                    shop_name: row.shop_name,
                    ph_number: row.ph_number,
                    is_active: row.shop_is_active, // Include shop's active status
                    location: {
                        address: row.address,
                        coordinates: {
                            lat: parseFloat(row.lat) || null,
                            long: parseFloat(row.long) || null
                        }
                    },
                    barbers: []
                });
            }
            
            const shop = shopsMap.get(row.shop_id);
            
            // Add barber if exists and not already added
            if (row.emp_id && !shop.barbers.some(b => b.emp_id === row.emp_id)) {
                const empBookings = bookings.filter(b => b.emp_id === row.emp_id);
                
                // Calculate queue info
                const totalInQueue = empBookings.length; 
                const inServiceBooking = empBookings.find(b => b.status === 'in_service');
                
                // Calculate estimated wait time
                let finalEstimatedWaitTime = 0;
                // Start with current time as the reference point for calculating next available slot (in IST)
                let lastBookingEndTime = dayjs(currentTime).tz(IST_TIMEZONE).toDate(); 

                // Sort all active bookings by join_time to process them sequentially
                const sortedActiveBookings = empBookings
                    .sort((a, b) => dayjs(a.join_time).tz(IST_TIMEZONE).toDate().getTime() - dayjs(b.join_time).tz(IST_TIMEZONE).toDate().getTime());

                for (let i = 0; i < sortedActiveBookings.length; i++) {
                    const booking = sortedActiveBookings[i];
                    const bookingJoinTime = dayjs.tz(booking.join_time, IST_TIMEZONE).toDate();
const bookingEndTime = dayjs.tz(booking.end_time, IST_TIMEZONE).toDate();

                    if (booking.status === 'in_service') {
                        lastBookingEndTime = dayjs(Math.max(lastBookingEndTime.getTime(), bookingEndTime.getTime() + 5 * 60000)).tz(IST_TIMEZONE).toDate(); // Add 5 min buffer
                    } else if (booking.status === 'booked') {
                        const potentialStartTimeAfterPrevious = dayjs(lastBookingEndTime).tz(IST_TIMEZONE).toDate(); 
                        const actualStartTimeForThisBooking = dayjs(Math.max(bookingJoinTime.getTime(), potentialStartTimeAfterPrevious.getTime())).tz(IST_TIMEZONE).toDate();
                        
                        lastBookingEndTime = dayjs(actualStartTimeForThisBooking.getTime() + (booking.service_duration_minutes || 0) * 60000 + 5 * 60000).tz(IST_TIMEZONE).toDate(); // Add 5 min buffer
                    }
                }

                finalEstimatedWaitTime = ((Math.max(0, Math.ceil((lastBookingEndTime.getTime() - currentTime.getTime()) / (1000 * 60))))-330);

                // Find customer's booking if customer_id is provided
                let customerBooking = null;
                let customerQueuePosition = null;
                
                if (customer_id) {
                    customerBooking = empBookings.find(b => 
                        b.customer_id === parseInt(customer_id) && b.status !== 'completed' && b.status !== 'cancelled'
                    );
                    
                    if (customerBooking) {
                        customerQueuePosition = sortedActiveBookings.findIndex(b => 
                            b.booking_id === customerBooking.booking_id
                        ) + 1; // +1 because array indices are 0-based
                    }
                }

                const barber = {
                    emp_id: row.emp_id,
                    emp_name: row.emp_name,
                    is_active: row.emp_is_active, // Include employee's active status
                    services: Array.isArray(row.services) ? row.services : [],
                    queue_info: {
                        total_people_in_queue: totalInQueue,
                        queue_position: totalInQueue + 1, // Position in the overall active queue for new bookings
                        estimated_wait_time: finalEstimatedWaitTime > 0 ? `${finalEstimatedWaitTime} mins` : "No wait",
                        current_status: inServiceBooking ? 
                            `Serving ${inServiceBooking.customer_name}` : 
                            (totalInQueue > 0 ? "Ready for next customer" : "Available"),
                        ...(customerQueuePosition !== null && { customer_queue_position: customerQueuePosition }) // Conditionally add customer's specific queue position
                    }
                };

                // Add customer's booking info if exists
                if (customerBooking) {
                    const joinTime = dayjs(customerBooking.join_time).tz(IST_TIMEZONE).toDate(); // Convert to IST
                    const endTime = dayjs(customerBooking.end_time).tz(IST_TIMEZONE).toDate(); // Convert to IST
                    
                    barber.your_booking = {
                        booking_id: customerBooking.booking_id,
                        join_time: dayjs(joinTime).format('HH:mm'),
                        service_duration: `${customerBooking.service_duration_minutes} mins`,
                        expected_end_time: dayjs(endTime).format('HH:mm'),
                        status: customerBooking.status,
                        services: customerBooking.service_type
                    };
                }

                shop.barbers.push(barber);
            }
        });

        // Convert map to array and calculate distances if coordinates provided
        const shops = Array.from(shopsMap.values());
        
        if (lat && long) {
            const userLocation = { latitude: parseFloat(lat), longitude: parseFloat(long) };
            
            shops.forEach(shop => {
                if (shop.location.coordinates.lat && shop.location.coordinates.long) {
                    const shopLocation = {
                        latitude: shop.location.coordinates.lat,
                        longitude: shop.location.coordinates.long
                    };
                    
                    // Ensure haversine function is available (e.g., imported or defined elsewhere)
                    const distance = haversine(userLocation, shopLocation);
                    shop.location.distance_from_you = `${(distance / 1000).toFixed(1)} km`;
                } else {
                    shop.location.distance_from_you = "Distance unavailable";
                }
            });
            
            // Sort by distance (if haversine is implemented)
            shops.sort((a, b) => {
                const distA = parseFloat(a.location.distance_from_you) || Infinity;
                const distB = parseFloat(b.location.distance_from_you) || Infinity;
                return distA - distB;
            });
        }

        res.status(200).json({
            message: 'Shops with barber details retrieved successfully',
            shops: shops,
            total_shops: shops.length,
            user_location_provided: !!(lat && long),
            timestamp: dayjs().tz(IST_TIMEZONE).toISOString() // Formatted to IST
        });

    } catch (error) {
        console.error('Error fetching shops with barber details:', error);
        res.status(500).json({ 
            error: 'Server error while fetching shops with barber details',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (client) client.release();
    }
});

// Register a service (for barber shops)
app.post('/register_service', async (req, res) => {
    const { service_name, service_duration_minutes } = req.body;
    
    // Enhanced validation
    if (!service_name || !service_duration_minutes) {
        return res.status(400).json({ 
            error: 'service_name and service_duration_minutes are required.' 
        });
    }

    // Validate service_name format
    if (typeof service_name !== 'string' || service_name.trim().length < 2) {
        return res.status(400).json({ 
            error: 'service_name must be a string with at least 2 characters.' 
        });
    }

    // Validate service_duration_minutes
    if (!Number.isInteger(service_duration_minutes) || service_duration_minutes <= 0) {
        return res.status(400).json({ 
            error: 'service_duration_minutes must be a positive integer.' 
        });
    }

    let client;
    try {
        client = await pool.connect();

        const result = await client.query(
            `INSERT INTO services (service_name, service_duration_minutes)
             VALUES ($1, $2) RETURNING *`,
            [service_name.trim(), service_duration_minutes]
        );
        
        res.status(201).json({
            message: 'Service registered successfully.',
            service: result.rows[0]
        });
    } catch (err) {
        if (err.code === '23505') { // UNIQUE violation
            return res.status(409).json({ 
                error: 'Service with this name already exists.' 
            });
        }
        console.error('Error registering service:', err);
        res.status(500).json({ 
            error: 'Server error while registering service.' 
        });
    } finally {
        if (client) client.release();
    }
});

// Get all available services
app.get('/services', async (req, res) => {
    let client;
    try {
        client = await pool.connect();

        const result = await client.query(
            'SELECT * FROM services ORDER BY service_name'
        );

        res.status(200).json({
            message: 'Services retrieved successfully',
            services: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching services:', error);
        res.status(500).json({ 
            error: 'Server error while fetching services.' 
        });
    } finally {
        if (client) client.release();
    }
});

// Register an employee (barber) and assign services
app.post('/register_employee', async (req, res) => {
    const { shop_id, emp_name, ph_number, service_ids } = req.body;
    
    // Enhanced validation
    if (!shop_id || !emp_name || !ph_number || !Array.isArray(service_ids)) {
        return res.status(400).json({
            error: 'shop_id, emp_name, ph_number, and service_ids[] are required.'
        });
    }

    // Validate shop_id
    if (!Number.isInteger(shop_id) || shop_id <= 0) {
        return res.status(400).json({
            error: 'shop_id must be a positive integer.'
        });
    }

    // Validate emp_name
    if (typeof emp_name !== 'string' || emp_name.trim().length < 2) {
        return res.status(400).json({
            error: 'emp_name must be a string with at least 2 characters.'
        });
    }

    // Validate ph_number
    if (typeof ph_number !== 'string' || ph_number.trim().length < 10) {
        return res.status(400).json({
            error: 'ph_number must be a valid phone number with at least 10 digits.'
        });
    }

    // Validate service_ids
    if (service_ids.length === 0) {
        return res.status(400).json({
            error: 'At least one service_id is required.'
        });
    }

    // Check if all service_ids are positive integers
    const invalidServiceIds = service_ids.filter(id => !Number.isInteger(id) || id <= 0);
    if (invalidServiceIds.length > 0) {
        return res.status(400).json({
            error: 'All service_ids must be positive integers.'
        });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Check shop existence and if it's active
        const shop = await client.query(
            `SELECT shop_id, shop_name FROM shops WHERE shop_id = $1 AND is_active = TRUE`,
            [shop_id]
        );
        
        if (shop.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ 
                error: 'Shop not found or inactive.' 
            });
        }

        // Check if employee with this phone number already exists in this shop
        const existingEmp = await client.query(
            `SELECT emp_id FROM employees WHERE shop_id = $1 AND ph_number = $2`,
            [shop_id, ph_number.trim()]
        );

        if (existingEmp.rowCount > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                error: 'Employee with this phone number already exists in this shop.'
            });
        }

        // Verify all service_ids exist
        const serviceCheck = await client.query(
            `SELECT service_id FROM services WHERE service_id = ANY($1)`,
            [service_ids]
        );

        if (serviceCheck.rowCount !== service_ids.length) {
            await client.query('ROLLBACK');
            const foundServiceIds = serviceCheck.rows.map(row => row.service_id);
            const missingServiceIds = service_ids.filter(id => !foundServiceIds.includes(id));
            return res.status(400).json({
                error: `Invalid service_ids: ${missingServiceIds.join(', ')}`
            });
        }

        // Insert employee
        const empInsert = await client.query(
            `INSERT INTO employees (shop_id, emp_name, ph_number)
             VALUES ($1, $2, $3) RETURNING *`,
            [shop_id, emp_name.trim(), ph_number.trim()]
        );
        
        const emp_id = empInsert.rows[0].emp_id;

        // Insert into employee_services (remove duplicates first)
        const uniqueServiceIds = [...new Set(service_ids)];
        for (const service_id of uniqueServiceIds) {
            await client.query(
                `INSERT INTO employee_services (emp_id, service_id)
                 VALUES ($1, $2)`,
                [emp_id, service_id]
            );
        }

        // Get the complete employee data with services
        const employeeWithServices = await client.query(`
            SELECT 
                e.*,
                array_agg(
                    json_build_object(
                        'service_id', s.service_id,
                        'service_name', s.service_name,
                        'service_duration_minutes', s.service_duration_minutes
                    )
                ) as services
            FROM employees e
            LEFT JOIN employee_services es ON e.emp_id = es.emp_id
            LEFT JOIN services s ON es.service_id = s.service_id
            WHERE e.emp_id = $1
            GROUP BY e.emp_id
        `, [emp_id]);

        await client.query('COMMIT');
        
        res.status(201).json({
            message: 'Employee registered and mapped to services successfully.',
            employee: employeeWithServices.rows[0],
            shop: shop.rows[0]
        });
        
    } catch (err) {
        await client.query('ROLLBACK');
        
        if (err.code === '23505') { // UNIQUE violation
            return res.status(409).json({
                error: 'Employee with this phone number already exists.'
            });
        }
        
        console.error('Error registering employee:', err);
        res.status(500).json({ 
            error: 'Server error while registering employee.' 
        });
    } finally {
        client.release();
    }
});

// Get employees by shop_id
app.get('/shops/:shop_id/employees', async (req, res) => {
    const { shop_id } = req.params;

    if (!Number.isInteger(parseInt(shop_id)) || parseInt(shop_id) <= 0) {
        return res.status(400).json({
            error: 'shop_id must be a positive integer.'
        });
    }

    let client;
    try {
        client = await pool.connect();

        const result = await client.query(`
            SELECT
                e.*,
                array_agg(
                    json_build_object(
                        'service_id', s.service_id,
                        'service_name', s.service_name,
                        'service_duration_minutes', s.service_duration_minutes
                    )
                ) as services
            FROM employees e
            LEFT JOIN employee_services es ON e.emp_id = es.emp_id
            LEFT JOIN services s ON es.service_id = s.service_id
            WHERE e.shop_id = $1 -- Removed 'AND e.is_active = TRUE' to fetch all employees
            GROUP BY e.emp_id
            ORDER BY e.emp_name
        `, [parseInt(shop_id)]);

        res.status(200).json({
            message: 'Employees retrieved successfully',
            employees: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({
            error: 'Server error while fetching employees.'
        });
    } finally {
        if (client) client.release();
    }
});

// Utility function to update booking statuses based on current time
async function updateBookingStatuses() {
    console.log('Running updateBookingStatuses to check for changes and send notifications...');
    let client;
    try {
        client = await pool.connect();

        await client.query('BEGIN'); // Start transaction

        const currentTime = dayjs().tz(IST_TIMEZONE).toDate(); // Current time in IST for all comparisons

        // 1. Update 'booked' to 'in_service'
        const inServiceResult = await client.query(
            `UPDATE bookings
             SET status = 'in_service'
             WHERE status = 'booked' AND join_time <= $1
             RETURNING booking_id, customer_id, shop_id, emp_id;`, // Added emp_id and shop_id
            [currentTime] // Compare with IST current time
        );

        for (const row of inServiceResult.rows) {
            console.log(`Booking ${row.booking_id} changed to in_service.`);
            // Notify Customer
            if (row.customer_id) { 
                await sendNotificationToCustomer(row.customer_id, {
                    title: 'Your Service Has Started!',
                    body: `Your booking (ID: ${row.booking_id}) is now in service.`,
                    url: `/dashboard?bookingId=${row.booking_id}`,
                    bookingId: row.booking_id,
                    type: 'status_in_service',
                });
            } else {
                console.warn(`Booking ${row.booking_id} updated to in_service but has no customer_id for notification.`);
            }
            // Notify Shop
            if (row.shop_id && row.emp_id) {
                const empNameResult = await client.query(`SELECT emp_name FROM employees WHERE emp_id = $1`, [row.emp_id]);
                const empName = empNameResult.rows[0]?.emp_name || 'an employee';
                await sendNotificationToShop(row.shop_id, {
                    title: 'Booking Started!',
                    body: `Booking (ID: ${row.booking_id}) with ${empName} is now in service.`,
                    url: `/shop/dashboard?bookingId=${row.booking_id}`,
                    bookingId: row.booking_id,
                    type: 'shop_booking_started',
                });
            }
        }

        // 2. Update 'in_service' to 'completed'
        const completedResult = await client.query(
            `UPDATE bookings
             SET status = 'completed'
             WHERE status = 'in_service' AND end_time <= $1
             RETURNING booking_id, customer_id, shop_id, emp_id;`, // Added emp_id and shop_id
            [currentTime] // Compare with IST current time
        );

        for (const row of completedResult.rows) {
            console.log(`Booking ${row.booking_id} changed to completed.`);
            // Notify Customer
            if (row.customer_id) { 
                await sendNotificationToCustomer(row.customer_id, {
                    title: 'Service Completed!',
                    body: `Your service for booking (ID: ${row.booking_id}) has been completed.`,
                    url: `/dashboard/history?bookingId=${row.booking_id}`,
                    bookingId: row.booking_id,
                    type: 'status_completed',
                });
            } else {
                console.warn(`Booking ${row.booking_id} updated to completed but has no customer_id for notification.`);
            }
            // Notify Shop
            if (row.shop_id && row.emp_id) {
                const empNameResult = await client.query(`SELECT emp_name FROM employees WHERE emp_id = $1`, [row.emp_id]);
                const empName = empNameResult.rows[0]?.emp_name || 'an employee';
                await sendNotificationToShop(row.shop_id, {
                    title: 'Booking Completed!',
                    body: `Booking (ID: ${row.booking_id}) with ${empName} has been completed.`,
                    url: `/shop/dashboard/history?bookingId=${row.booking_id}`,
                    bookingId: row.booking_id,
                    type: 'shop_booking_completed',
                });
            }
        }

        // 3. Update 'booked' to 'cancelled' if join_time has passed and status is still 'booked' (missed appointment)
        const missedResult = await client.query(
            `UPDATE bookings
             SET status = 'cancelled'
             WHERE status = 'booked' AND join_time <= $1 AND customer_id IS NOT NULL
             RETURNING booking_id, customer_id, shop_id, emp_id;`, // Added emp_id and shop_id
            [currentTime] // Compare with IST current time
        );

        for (const row of missedResult.rows) {
            console.log(`Booking ${row.booking_id} changed to cancelled (missed appointment).`);
            // Notify Customer
            if (row.customer_id) {
                await sendNotificationToCustomer(row.customer_id, {
                    title: 'Appointment Missed',
                    body: `Your booking (ID: ${row.booking_id}) at Shop ${row.shop_id} was cancelled as you missed your appointment.`,
                    url: `/dashboard/history?bookingId=${row.booking_id}`,
                    bookingId: row.booking_id,
                    type: 'status_missed',
                });
            } else {
                console.warn(`Booking ${row.booking_id} cancelled but has no customer_id for notification.`);
            }
            // Notify Shop
            if (row.shop_id && row.emp_id) {
                const empNameResult = await client.query(`SELECT emp_name FROM employees WHERE emp_id = $1`, [row.emp_id]);
                const empName = empNameResult.rows[0]?.emp_name || 'an employee';
                await sendNotificationToShop(row.shop_id, {
                    title: 'Booking Missed!',
                    body: `Booking (ID: ${row.booking_id}) with ${empName} was missed by the customer.`,
                    url: `/shop/dashboard?bookingId=${row.booking_id}`,
                    bookingId: row.booking_id,
                    type: 'shop_booking_missed',
                });
            }
        }

        await client.query('COMMIT');
        console.log('Finished checking and updating booking statuses.');

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('Error in updateBookingStatuses:', error);
        // Do not re-throw if this is a background job, but consider it for API endpoints
    } finally {
        if (client) {
            client.release();
        }
    }
}


// Schedule automatic status updates every minute
// In a serverless environment like Vercel, `setInterval` might not behave as expected
// because functions are stateless and spin up/down. For background tasks,
// you'd typically use Vercel Cron Jobs or a dedicated task runner.
// For now, we'll keep it for local testing, but be aware of its limitations on Vercel.
setInterval(updateBookingStatuses, 60000); // Run every 60 seconds

// Book a service - Create a new booking with automatic timing
app.post('/bookings', async (req, res) => {
    const { shop_id, emp_id, customer_id, service_ids } = req.body;
    
    // --- (UNCHANGED VALIDATION & INITIAL SETUP) ---
    if (!shop_id || !emp_id || !customer_id || !Array.isArray(service_ids) || service_ids.length === 0) {
        return res.status(400).json({ 
            error: 'Missing required fields: shop_id, emp_id, customer_id, service_ids[]' 
        });
    }
    if (!Number.isInteger(shop_id) || shop_id <= 0) {
        return res.status(400).json({ error: 'shop_id must be a positive integer' });
    }
    if (!Number.isInteger(emp_id) || emp_id <= 0) {
        return res.status(400).json({ error: 'emp_id must be a positive integer' });
    }
    if (!Number.isInteger(customer_id) || customer_id <= 0) {
        return res.status(400).json({ error: 'customer_id must be a positive integer' });
    }
    const invalidServiceIds = service_ids.filter(id => !Number.isInteger(id) || id <= 0);
    if (invalidServiceIds.length > 0) {
        return res.status(400).json({ error: 'All service_ids must be positive integers' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await updateBookingStatuses(client); // Ensure statuses are fresh

        const currentTime = dayjs().tz(IST_TIMEZONE).toDate(); // Current time in IST

        const shopCheck = await client.query('SELECT shop_id, shop_name FROM shops WHERE shop_id = $1 AND is_active = TRUE', [shop_id]);
        if (shopCheck.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Shop not found or inactive' }); }
        const empCheck = await client.query('SELECT emp_id, emp_name FROM employees WHERE emp_id = $1 AND shop_id = $2 AND is_active = TRUE', [emp_id, shop_id]);
        if (empCheck.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Employee not found, inactive, or does not belong to this shop' }); }
        const customerCheck = await client.query('SELECT customer_id, customer_name FROM customers WHERE customer_id = $1', [customer_id]);
        if (customerCheck.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Customer not found' }); }

        const existingBookingForCustomer = await client.query(`
            SELECT booking_id FROM bookings
            WHERE emp_id = $1 AND customer_id = $2
            AND DATE(join_time) = DATE($3)
            AND status IN ('booked', 'in_service')
        `, [emp_id, customer_id, currentTime]);
        if (existingBookingForCustomer.rowCount > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Customer already has an active booking with this employee today' });
        }

        const empServicesCheck = await client.query(`
            SELECT es.service_id FROM employee_services es
            WHERE es.emp_id = $1 AND es.service_id = ANY($2)
        `, [emp_id, service_ids]);
        if (empServicesCheck.rowCount !== service_ids.length) {
            const availableServiceIds = empServicesCheck.rows.map(row => row.service_id);
            const unavailableServices = service_ids.filter(id => !availableServiceIds.includes(id));
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Employee cannot provide services with IDs: ${unavailableServices.join(', ')}` });
        }

        const serviceQuery = `
            SELECT service_id, service_name, service_duration_minutes
            FROM services
            WHERE service_id = ANY($1)
        `;
        const { rows: services } = await client.query(serviceQuery, [service_ids]);
        if (services.length !== service_ids.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'One or more service IDs are invalid' });
        }
        const totalDuration = services.reduce((sum, s) => sum + s.service_duration_minutes, 0);

        // --- THE CORE LOGIC FOR FINDING THE BEST SLOT ---
        let actualJoinTime;
        let foundSlot = false;
        const bookingDurationMs = totalDuration * 60000;
        const bufferTimeMs = 5 * 60000; // 5 minutes buffer

        // 1. Get all *active* bookings for this employee, ordered by join_time
        const activeBookings = await client.query(`
            SELECT booking_id, join_time, end_time, service_duration_minutes, status
            FROM bookings
            WHERE emp_id = $1 AND status IN ('booked', 'in_service')
            ORDER BY join_time ASC;
        `, [emp_id]);

        // 2. Determine the earliest possible start time for any new service
        // This is now (in IST) + 5 minutes buffer
        let potentialSlotStart = dayjs(currentTime).add(5, 'minute').toDate();

        // 3. Iterate through existing bookings to find a gap
        // If there's an 'in_service' booking, the slot can't start before its end time
        if (activeBookings.rows.length > 0 && activeBookings.rows[0].status === 'in_service') {
            // Ensure end_time from DB is treated as IST for comparison
            const inServiceEndTimeIST = dayjs(activeBookings.rows[0].end_time).tz(IST_TIMEZONE).toDate();
            potentialSlotStart = dayjs(Math.max(potentialSlotStart.getTime(), inServiceEndTimeIST.getTime() + bufferTimeMs)).toDate();
        }

        // Now iterate through the rest of the queue to find gaps
        for (let i = 0; i < activeBookings.rows.length; i++) {
            const currentBooking = activeBookings.rows[i];
            // Treat DB times as IST for calculations
            const currentBookingStartTime = dayjs(currentBooking.join_time).tz(IST_TIMEZONE).toDate();
            const currentBookingEndTime = dayjs(currentBooking.end_time).tz(IST_TIMEZONE).toDate();

            // Check the gap *before* the current booking
            // The gap must be large enough to accommodate the new booking + buffer
            if (potentialSlotStart.getTime() + bookingDurationMs <= currentBookingStartTime.getTime()) {
                // Found a slot!
                actualJoinTime = potentialSlotStart;
                foundSlot = true;
                break;
            }

            // Move potentialSlotStart to after the current booking (in IST)
            // This sets up the check for the gap *after* the current booking
            potentialSlotStart = dayjs(currentBookingEndTime.getTime() + bufferTimeMs).toDate();
        }

        // If no slot was found in between, place it at the very end of the queue
        if (!foundSlot) {
            actualJoinTime = potentialSlotStart; // This would be after the last booking + buffer
        }
        // --- END OF CORE LOGIC ---

        const endTime = dayjs(actualJoinTime).add(totalDuration, 'minute').toDate(); // Calculate end time based on IST join time

        const service_type = services.map(s => ({
            id: s.service_id,
            name: s.service_name,
            duration_minutes: s.service_duration_minutes
        }));

        let initialStatus = 'booked';
        if (dayjs(actualJoinTime).tz(IST_TIMEZONE).toDate() <= currentTime) { // Compare IST times
            initialStatus = 'in_service';
        }

        const insertQuery = `
            INSERT INTO bookings (
                shop_id, emp_id, customer_id,
                service_type, join_time, service_duration_minutes, end_time, status
            )
            VALUES ($1, $2, $3, $4::json, $5, $6, $7, $8)
            RETURNING *
        `;
        const values = [
            shop_id,
            emp_id,
            customer_id,
            JSON.stringify(service_type),
            // IMPORTANT: Format to IST string before sending to DB for 'timestamp without time zone'
            dayjs(actualJoinTime).tz(IST_TIMEZONE).format('YYYY-MM-DD HH:mm:ss'), 
            totalDuration,
            // IMPORTANT: Format to IST string before sending to DB for 'timestamp without time zone'
            dayjs(endTime).tz(IST_TIMEZONE).format('YYYY-MM-DD HH:mm:ss'), 
            initialStatus
        ];

        const { rows } = await client.query(insertQuery, values);
        const newBooking = rows[0];
        
        await client.query('COMMIT');

        // Calculate queue position relative to IST times
        const queuePosition = await client.query(`
            SELECT COUNT(*) + 1 as position
            FROM bookings
            WHERE emp_id = $1
            AND status = 'booked'
            AND join_time < $2
        `, [emp_id, actualJoinTime]);

        // Notify Customer
        await sendNotificationToCustomer(customer_id, {
            title: 'Booking Confirmed!',
            body: `Your booking (ID: ${newBooking.booking_id}) at ${shopCheck.rows[0].shop_name} with ${empCheck.rows[0].emp_name} is confirmed for ${dayjs(actualJoinTime).tz(IST_TIMEZONE).format('hh:mm A')}.`,
            url: `/dashboard?bookingId=${newBooking.booking_id}`,
            bookingId: newBooking.booking_id,
            type: 'new_booking_customer',
        });

        // Notify Shop
        await sendNotificationToShop(shop_id, {
            title: 'New Booking Received!',
            body: `A new booking (ID: ${newBooking.booking_id}) has been made with ${empCheck.rows[0].emp_name} for ${customerCheck.rows[0].customer_name} at ${dayjs(actualJoinTime).tz(IST_TIMEZONE).format('hh:mm A')}.`,
            url: `/shop/dashboard?bookingId=${newBooking.booking_id}`,
            bookingId: newBooking.booking_id,
            type: 'new_booking_shop',
        });


        res.status(201).json({
            message: 'Booking created successfully',
            booking: {
                ...newBooking,
                shop_name: shopCheck.rows[0].shop_name,
                emp_name: empCheck.rows[0].emp_name,
                customer_name: customerCheck.rows[0].customer_name,
                services: services,
                total_duration_minutes: totalDuration,
                queue_position: initialStatus === 'booked' ? queuePosition.rows[0].position : null,
                formatted_times: {
                    join_time: dayjs(actualJoinTime).tz(IST_TIMEZONE).format('YYYY-MM-DD HH:mm:ss'),
                    end_time: dayjs(endTime).tz(IST_TIMEZONE).format('YYYY-MM-DD HH:mm:ss'),
                    join_time_display: dayjs(actualJoinTime).tz(IST_TIMEZONE).format('MMM DD, YYYY - hh:mm A'),
                    end_time_display: dayjs(endTime).tz(IST_TIMEZONE).format('MMM DD, YYYY - hh:mm A')
                },
                estimated_wait_time: initialStatus === 'booked' ?
                    Math.max(0, Math.ceil((dayjs(actualJoinTime).tz(IST_TIMEZONE).toDate().getTime() - currentTime.getTime()) / (1000 * 60))) + ' minutes' :
                    'Service starting now',
                automatic_status_info: {
                    will_start_at: dayjs(actualJoinTime).tz(IST_TIMEZONE).format('MMM DD, YYYY - hh:mm A'),
                    will_complete_at: dayjs(endTime).tz(IST_TIMEZONE).format('MMM DD, YYYY - hh:mm A'),
                    status_changes: {
                        to_in_service: dayjs(actualJoinTime).tz(IST_TIMEZONE).toDate() <= currentTime ? 'Already started' : 'When join_time is reached',
                        to_completed: 'Automatically when service ends'
                    }
                }
            }
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Booking error:', err.message);
        res.status(500).json({
            error: 'Failed to create booking',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    } finally {
        client.release();
    }
});

app.post('/bookings/cancel', async (req, res) => {
    const { customer_id, booking_id } = req.body;

    // 1. Validate Input
    if (!customer_id || !booking_id) {
        return res.status(400).json({ error: 'Missing required fields: customer_id, booking_id' });
    }
    if (!Number.isInteger(customer_id) || customer_id <= 0) {
        return res.status(400).json({ error: 'customer_id must be a positive integer' });
    }
    if (!Number.isInteger(booking_id) || booking_id <= 0) {
        return res.status(400).json({ error: 'booking_id must be a positive integer' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 2. Verify Ownership and Status
        // FOR UPDATE locks the row to prevent race conditions during cancellation
        const bookingCheck = await client.query(
            `SELECT emp_id, status, join_time, end_time, service_duration_minutes, shop_id
             FROM bookings
             WHERE booking_id = $1 AND customer_id = $2 FOR UPDATE`,
            [booking_id, customer_id]
        );

        if (bookingCheck.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Booking not found or does not belong to this customer' });
        }

        const bookingToCancel = bookingCheck.rows[0];

        if (['completed', 'cancelled'].includes(bookingToCancel.status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Booking is already ${bookingToCancel.status}. Cannot cancel.` });
        }

        const { emp_id, join_time, end_time, service_duration_minutes, shop_id } = bookingToCancel;

        // 3. Update Booking Status
        const cancelQuery = `
            UPDATE bookings
            SET status = 'cancelled'
            WHERE booking_id = $1
            RETURNING *;
        `;
        const { rows: cancelledBookingRows } = await client.query(cancelQuery, [booking_id]);
        const cancelledBooking = cancelledBookingRows[0];

        // 4. Re-evaluate Queue for subsequent bookings
        // We only adjust if the cancelled booking was actually 'booked' or 'in_service'
        if (bookingToCancel.status === 'booked' || bookingToCancel.status === 'in_service') {
            // Pass the raw Date object for end_time, which represents IST
            await updateSubsequentBookings(client, emp_id, end_time, service_duration_minutes, shop_id); 
        }

        // Notify Shop about customer cancellation
        if (shop_id && emp_id) {
            const empNameResult = await client.query(`SELECT emp_name FROM employees WHERE emp_id = $1`, [emp_id]);
            const empName = empNameResult.rows[0]?.emp_name || 'an employee';
            const customerNameResult = await client.query(`SELECT customer_name FROM customers WHERE customer_id = $1`, [customer_id]);
            const customerName = customerNameResult.rows[0]?.customer_name || 'A customer';

            await sendNotificationToShop(shop_id, {
                title: 'Booking Cancelled by Customer!',
                body: `Booking (ID: ${booking_id}) with ${empName} for ${customerName} at ${dayjs(join_time).tz(IST_TIMEZONE).format('hh:mm A')} has been cancelled by the customer.`, // Formatted to IST
                url: `/shop/dashboard?bookingId=${booking_id}`,
                bookingId: booking_id,
                type: 'shop_booking_customer_cancelled',
            });
        }

        await client.query('COMMIT');

        res.status(200).json({
            message: 'Booking cancelled successfully',
            cancelled_booking: {
                booking_id: cancelledBooking.booking_id,
                status: cancelledBooking.status,
                original_join_time: dayjs(join_time).tz(IST_TIMEZONE).format('YYYY-MM-DD HH:mm:ss'), // Formatted to IST
                original_end_time: dayjs(end_time).tz(IST_TIMEZONE).format('YYYY-MM-DD HH:mm:ss') // Formatted to IST
            }
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Booking cancellation error:', err.message);
        res.status(500).json({
            error: 'Failed to cancel booking',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    } finally {
        client.release();
    }
});


app.post('/shop/bookings/cancel', async (req, res) => {
    // Extract booking_id and shop_id from the request body
    const { booking_id, shop_id } = req.body;

    // 1. Validate Input
    if (!booking_id || !shop_id) {
        return res.status(400).json({ error: 'Missing required fields: booking_id, shop_id' });
    }
    if (!Number.isInteger(booking_id) || booking_id <= 0) {
        return res.status(400).json({ error: 'booking_id must be a positive integer' });
    }
    if (!Number.isInteger(shop_id) || shop_id <= 0) {
        return res.status(400).json({ error: 'shop_id must be a positive integer' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 2. Verify Shop Ownership of the Barber and Booking Status
        const bookingCheck = await client.query(
            `SELECT b.emp_id, b.status, b.join_time, b.end_time, b.service_duration_minutes, b.customer_id
             FROM bookings b
             JOIN employees e ON b.emp_id = e.emp_id
             WHERE b.booking_id = $1 AND e.shop_id = $2 FOR UPDATE`,
            [booking_id, shop_id] // Use shop_id from req.body directly
        );

        if (bookingCheck.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Booking not found or does not belong to this shop' });
        }

        const bookingToCancel = bookingCheck.rows[0];

        if (['completed', 'cancelled'].includes(bookingToCancel.status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Booking is already ${bookingToCancel.status}. Cannot cancel.` });
        }

        const { emp_id, join_time, end_time, service_duration_minutes, customer_id } = bookingToCancel;

        // 3. Update Booking Status
        const cancelQuery = `
            UPDATE bookings
            SET status = 'cancelled'
            WHERE booking_id = $1
            RETURNING *;
        `;
        const { rows: cancelledBookingRows } = await client.query(cancelQuery, [booking_id]);
        const cancelledBooking = cancelledBookingRows[0];

        // 4. Re-evaluate Queue for subsequent bookings
        if (bookingToCancel.status === 'booked' || bookingToCancel.status === 'in_service') {
            // Pass the raw Date object for end_time, which represents IST
            await updateSubsequentBookings(client, emp_id, end_time, service_duration_minutes, shop_id); 
        }

        // 5. Send Notification to Customer about Cancellation
        if (customer_id) {
            const notificationPayload = {
                title: 'Booking Cancelled!',
                body: `Your booking (ID: ${booking_id}) on ${dayjs(join_time).tz(IST_TIMEZONE).format('YYYY-MM-DD')} at ${dayjs(join_time).tz(IST_TIMEZONE).format('hh:mm A')} has been cancelled by the shop.`, // Formatted to IST
                url: `/dashboard?bookingId=${booking_id}`, // Link to customer's dashboard or specific booking
                bookingId: booking_id,
                type: 'booking_cancelled', // Custom type for client-side handling
            };
            await sendNotificationToCustomer(customer_id, notificationPayload);
            console.log(`Cancellation notification sent to customer ${customer_id} for booking ${booking_id}.`);
        }

        // 6. Send Notification to Shop about their own cancellation (confirmation)
        if (shop_id) {
            await sendNotificationToShop(shop_id, {
                title: 'Booking Successfully Cancelled!',
                body: `You have successfully cancelled booking (ID: ${booking_id}) for ${dayjs(join_time).tz(IST_TIMEZONE).format('hh:mm A')}.`, // Formatted to IST
                url: `/shop/dashboard?bookingId=${booking_id}`,
                bookingId: booking_id,
                type: 'shop_booking_self_cancelled',
            });
        }

        await client.query('COMMIT');

        res.status(200).json({
            message: 'Booking cancelled successfully by shop',
            cancelled_booking: {
                booking_id: cancelledBooking.booking_id,
                status: cancelledBooking.status,
                original_join_time: dayjs(join_time).tz(IST_TIMEZONE).format('YYYY-MM-DD HH:mm:ss'), // Formatted to IST
                original_end_time: dayjs(end_time).tz(IST_TIMEZONE).format('YYYY-MM-DD HH:mm:ss') // Formatted to IST
            }
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Shop booking cancellation error:', err.message);
        res.status(500).json({
            error: 'Failed to cancel booking by shop',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    } finally {
        client.release();
    }
});
// --- CORRECTED Helper function to update subsequent bookings ---
// Ensure webpush and sendNotificationToCustomer are defined and accessible globally or in an appropriate scope in your app.js
// as provided in the previous turn.

async function updateSubsequentBookings(client, empId, cancelledBookingOriginalEndTime, cancelledServiceDurationMinutes, shopId) {

    const subsequentBookingsQuery = `
        SELECT booking_id, customer_id, join_time, end_time, service_duration_minutes, status
        FROM bookings
        WHERE emp_id = $1
        AND status IN ('booked', 'in_service')
        AND join_time >= $2
        ORDER BY join_time ASC;
    `;
    // Ensure cancelledBookingOriginalEndTime is treated as IST for comparison
    const { rows: subsequentBookings } = await client.query(subsequentBookingsQuery, [empId, dayjs(cancelledBookingOriginalEndTime).tz(IST_TIMEZONE).toDate()]);

    if (subsequentBookings.length === 0) {
        return;
    }

    const currentTime = dayjs().tz(IST_TIMEZONE).toDate(); // Use IST current time

    const timeToShift = cancelledServiceDurationMinutes * 60000; // minutes to ms

    let effectivePreviousEndTime;

    const precedingBookingQuery = await client.query(`
        SELECT end_time
        FROM bookings
        WHERE emp_id = $1
        AND status IN ('completed', 'in_service', 'booked')
        AND end_time < $2
        ORDER BY end_time DESC
        LIMIT 1;
    `, [empId, dayjs(cancelledBookingOriginalEndTime).tz(IST_TIMEZONE).toDate()]); // Treat as IST

    if (precedingBookingQuery.rowCount > 0) {
        effectivePreviousEndTime = dayjs(precedingBookingQuery.rows[0].end_time).tz(IST_TIMEZONE).toDate().getTime(); // Treat as IST
    } else {
        effectivePreviousEndTime = currentTime.getTime();
    }

    let currentCalculatedTime = dayjs(effectivePreviousEndTime).add(5, 'minute').toDate(); // Calculate in IST
    currentCalculatedTime = dayjs(Math.max(currentCalculatedTime.getTime(), currentTime.getTime() + 5 * 60000)).toDate(); // Calculate in IST

    for (const booking of subsequentBookings) {
        const originalJoinTime = dayjs(booking.join_time).tz(IST_TIMEZONE).toDate(); // Treat as IST
        const originalEndTime = dayjs(booking.end_time).tz(IST_TIMEZONE).toDate(); // Treat as IST
        const customerId = booking.customer_id;

        const originalEstimatedWaitTime = Math.max(0, Math.ceil((originalJoinTime.getTime() - currentTime.getTime()) / (1000 * 60)));

        let newJoinTime;
        let newEndTime;

        newJoinTime = dayjs(Math.max(originalJoinTime.getTime() - timeToShift, currentCalculatedTime.getTime())).toDate(); // Calculate in IST
        newEndTime = dayjs(newJoinTime).add(booking.service_duration_minutes, 'minute').toDate(); // Calculate in IST

        const newEstimatedWaitTime = Math.max(0, Math.ceil((newJoinTime.getTime() - currentTime.getTime()) / (1000 * 60)));

        if (newJoinTime.getTime() !== originalJoinTime.getTime() || newEndTime.getTime() !== originalEndTime.getTime()) {
            await client.query(
                `UPDATE bookings
                 SET join_time = $1, end_time = $2
                 WHERE booking_id = $3`,
                // IMPORTANT: Format to IST string before sending to DB for 'timestamp without time zone'
                [dayjs(newJoinTime).tz(IST_TIMEZONE).format('YYYY-MM-DD HH:mm:ss'), 
                 dayjs(newEndTime).tz(IST_TIMEZONE).format('YYYY-MM-DD HH:mm:ss'), 
                 booking.booking_id] 
            );
            console.log(`Updated booking ${booking.booking_id}: Old join_time: ${dayjs(originalJoinTime).tz(IST_TIMEZONE).format('HH:mm')}, New join_time ${dayjs(newJoinTime).tz(IST_TIMEZONE).format('HH:mm')}`); // Log in IST

            // Notify Customer about time shift
            if (customerId) {
                let notificationPayload = null;
                const timeDifference = originalEstimatedWaitTime - newEstimatedWaitTime;

                if (timeDifference >= 5) { // Notify if shifted by 5 minutes or more
                    notificationPayload = {
                        title: 'Booking Time Shifted!',
                        body: `Your booking (ID: ${booking.booking_id}) is now scheduled ${timeDifference} minutes earlier. New start time: ${dayjs(newJoinTime).tz(IST_TIMEZONE).format('hh:mm A')}.`, // Formatted to IST
                        url: `/dashboard?bookingId=${booking.booking_id}`,
                        bookingId: booking.booking_id,
                        type: 'time_shift',
                    };
                }

                if (originalEstimatedWaitTime > 10 && newEstimatedWaitTime <= 10) { // Notify if wait time becomes critical
                    notificationPayload = {
                        title: 'Get Ready Soon!',
                        body: `Your estimated wait time for booking (ID: ${booking.booking_id}) is now less than 10 minutes.`,
                        url: `/dashboard?bookingId=${booking.booking_id}`,
                        bookingId: booking.booking_id,
                        type: 'wait_time_critical',
                    };
                }

                if (notificationPayload) {
                    await sendNotificationToCustomer(customerId, notificationPayload);
                }
            }

            // Notify Shop about queue changes
            if (shopId) {
                const empNameResult = await client.query(`SELECT emp_name FROM employees WHERE emp_id = $1`, [empId]);
                const empName = empNameResult.rows[0]?.emp_name || 'an employee';
                const customerNameResult = await client.query(`SELECT customer_name FROM customers WHERE customer_id = $1`, [customerId]);
                const customerName = customerNameResult.rows[0]?.customer_name || 'A customer';

                await sendNotificationToShop(shopId, {
                    title: 'Queue Updated!',
                    body: `Booking (ID: ${booking.booking_id}) for ${customerName} with ${empName} has been shifted. New start time: ${dayjs(newJoinTime).tz(IST_TIMEZONE).format('hh:mm A')}.`, // Formatted to IST
                    url: `/shop/dashboard?bookingId=${booking.booking_id}`,
                    bookingId: booking.booking_id,
                    type: 'shop_queue_update',
                });
            }
        }
        currentCalculatedTime = dayjs(newEndTime).add(5, 'minute').toDate(); // Calculate in IST
    }
}
// --- Route to get bookings for a specific customer with filters and pagination ---
app.post('/getBookingsbycustomer', async (req, res) => {
    const {
        customer_id,
        status,
        date,
        shop_id,
        emp_id,
        limit = 50,
        offset = 0,
        sort_by = 'join_time',
        sort_order = 'DESC'
    } = req.body;

    // Validate customer_id - it's mandatory for this route
    if (!customer_id || !Number.isInteger(parseInt(customer_id))) {
        return res.status(400).json({ error: 'customer_id is required and must be an integer.' });
    }

    // Validate limit and offset for pagination
    const limitNum = Math.min(Math.max(parseInt(limit) || 50, 1), 100); // Max 100 records per page
    const offsetNum = Math.max(parseInt(offset) || 0, 0);

    // Validate sort parameters to prevent SQL injection and ensure valid fields
    const validSortFields = ['join_time', 'end_time', 'status', 'shop_name', 'emp_name'];
    const validSortOrders = ['ASC', 'DESC'];
    const sortBy = validSortFields.includes(sort_by) ? sort_by : 'join_time';
    const sortOrder = validSortOrders.includes(sort_order?.toUpperCase()) ? sort_order.toUpperCase() : 'DESC';

    let client;
    try {
        client = await pool.connect();

        // Define currentTime at the beginning of the route handler for consistent time calculations
        const currentTime = dayjs().tz(IST_TIMEZONE).toDate(); // Use IST current time

        // It's good practice to update booking statuses before fetching,
        // ensuring the data is as current as possible.
        // This function 'updateBookingStatuses' is assumed to be defined elsewhere.
        await updateBookingStatuses();

        // Build the dynamic SQL query to fetch bookings for a specific customer
        let query = `
            SELECT
                b.*,
                s.shop_name,
                s.address as shop_address,
                e.emp_name,
                c.customer_name,
                c.customer_ph_number
            FROM bookings b
            JOIN shops s ON b.shop_id = s.shop_id
            JOIN employees e ON b.emp_id = e.emp_id
            JOIN customers c ON b.customer_id = c.customer_id
            WHERE b.customer_id = $1 -- Always filter by customer_id
        `;

        const queryParams = [parseInt(customer_id)]; // customer_id is the first parameter
        let paramIndex = 2; // Start parameter index from 2 for additional filters

        // Add optional filters based on provided parameters
        if (status && ['booked', 'in_service', 'completed', 'cancelled'].includes(status)) {
            query += ` AND b.status = $${paramIndex}`;
            queryParams.push(status);
            paramIndex++;
        }

        if (date) {
            const dateObj = dayjs(date).tz(IST_TIMEZONE).toDate(); // Treat input date as IST
            if (!isNaN(dateObj.getTime())) { // Check if date is valid
                query += ` AND DATE(b.join_time) = DATE($${paramIndex})`;
                queryParams.push(dateObj);
                paramIndex++;
            }
        }

        // Filter by shop_id if provided
        if (shop_id && Number.isInteger(parseInt(shop_id))) {
            query += ` AND b.shop_id = $${paramIndex}`;
            queryParams.push(parseInt(shop_id));
            paramIndex++;
        }

        // Filter by emp_id if provided
        if (emp_id && Number.isInteger(parseInt(emp_id))) {
            query += ` AND b.emp_id = $${paramIndex}`;
            queryParams.push(parseInt(emp_id));
            paramIndex++;
        }

        // Add sorting based on the chosen field and order
        if (sortBy === 'shop_name') {
            query += ` ORDER BY s.shop_name ${sortOrder}`;
        } else if (sortBy === 'emp_name') {
            query += ` ORDER BY e.emp_name ${sortOrder}`;
        } else {
            query += ` ORDER BY b.${sortBy} ${sortOrder}`;
        }

        // Add pagination (LIMIT and OFFSET)
        query += ` LIMIT $${paramIndex}`;
        queryParams.push(limitNum);
        paramIndex++;

        query += ` OFFSET $${paramIndex}`;
        queryParams.push(offsetNum);

        // Execute the main query to get the bookings
        const result = await client.query(query, queryParams); // Use client here

        // --- Get total count for pagination (using the same filters) ---
        let countQuery = `
            SELECT COUNT(*) as total
            FROM bookings b
            JOIN shops s ON b.shop_id = s.shop_id
            JOIN employees e ON b.emp_id = e.emp_id
            JOIN customers c ON b.customer_id = c.customer_id
            WHERE b.customer_id = $1 -- Always filter by customer_id for count
        `;

        const countParams = [parseInt(customer_id)]; // customer_id is the first parameter for count query
        let countParamIndex = 2; // Start parameter index from 2 for additional filters

        if (status && ['booked', 'in_service', 'completed', 'cancelled'].includes(status)) {
            countQuery += ` AND b.status = $${countParamIndex}`;
            countParams.push(status);
            countParamIndex++;
        }

        if (date) {
            const dateObj = dayjs(date).tz(IST_TIMEZONE).toDate(); // Treat input date as IST
            if (!isNaN(dateObj.getTime())) {
                countQuery += ` AND DATE(b.join_time) = DATE($${countParamIndex})`;
                countParams.push(dateObj);
                countParamIndex++;
            }
        }

        if (shop_id && Number.isInteger(parseInt(shop_id))) {
            countQuery += ` AND b.shop_id = $${countParamIndex}`;
            countParams.push(parseInt(shop_id));
            countParamIndex++;
        }

        if (emp_id && Number.isInteger(parseInt(emp_id))) {
            countQuery += ` AND b.emp_id = $${countParamIndex}`;
            countParams.push(parseInt(emp_id));
            countParamIndex++;
        }

        // Execute the count query to get the total number of records matching the filters
        const countResult = await client.query(countQuery, countParams); // Use client here
        const totalCount = parseInt(countResult.rows[0].total);

        // Process and format each booking's data for the response
        const bookings = result.rows.map(booking => {
            let timeInfo = {}; // Object to hold time-related display information
            const joinTime = dayjs(booking.join_time).tz(IST_TIMEZONE).toDate(); // Convert to IST
            const endTime = dayjs(booking.end_time).tz(IST_TIMEZONE).toDate(); // Convert to IST

            // Populate timeInfo based on the booking status
            if (booking.status === 'booked') {
                const timeUntilStart = Math.max(0, Math.ceil((joinTime.getTime() - currentTime.getTime()) / (1000 * 60)));
                timeInfo = {
                    time_until_service: timeUntilStart + ' minutes',
                    estimated_start: dayjs(joinTime).format('hh:mm A')
                };
            } else if (booking.status === 'in_service') {
                const timeUntilEnd = Math.max(0, Math.ceil((endTime.getTime() - currentTime.getTime()) / (1000 * 60)));
                timeInfo = {
                    time_remaining: timeUntilEnd + ' minutes',
                    estimated_completion: dayjs(endTime).format('hh:mm A')
                };
            } else if (booking.status === 'completed') {
                timeInfo = {
                    completed_at: dayjs(endTime).format('MMM DD, YYYY - hh:mm A'),
                    duration_was: booking.service_duration_minutes + ' minutes'
                };
            }

            return {
                ...booking, // Include all original booking fields
                formatted_times: {
                    join_time: dayjs(joinTime).format('YYYY-MM-DD HH:mm:ss'),
                    end_time: dayjs(endTime).format('YYYY-MM-DD HH:mm:ss'),
                    join_time_display: dayjs(joinTime).format('MMM DD, YYYY - hh:mm A'),
                    end_time_display: dayjs(endTime).format('MMM DD, YYYY - hh:mm A')
                },
                ...timeInfo // Add status-specific time information
            };
        });

        // Calculate pagination metadata
        const totalPages = Math.ceil(totalCount / limitNum);
        const currentPage = Math.floor(offsetNum / limitNum) + 1;
        const hasNextPage = offsetNum + limitNum < totalCount;
        const hasPrevPage = offsetNum > 0;

        // --- Construct status summary query and parameters for the specific customer ---
        let statusSummaryQuery = `
            SELECT status, COUNT(*) as count
            FROM bookings b
            WHERE b.customer_id = $1 -- Always filter by customer_id for summary
        `;
        const statusSummaryParams = [parseInt(customer_id)];
        let statusSummaryParamIndex = 2;

        if (date) {
            statusSummaryQuery += ` AND DATE(b.join_time) = DATE($${statusSummaryParamIndex})`;
            statusSummaryParams.push(dayjs(date).tz(IST_TIMEZONE).toDate()); // Treat input date as IST
            statusSummaryParamIndex++;
        }
        if (shop_id && Number.isInteger(parseInt(shop_id))) {
            statusSummaryQuery += ` AND b.shop_id = $${statusSummaryParamIndex}`;
            statusSummaryParams.push(parseInt(shop_id));
            statusSummaryParamIndex++;
        }
        if (emp_id && Number.isInteger(parseInt(emp_id))) {
            statusSummaryQuery += ` AND b.emp_id = $${statusSummaryParamIndex}`;
            statusSummaryParams.push(parseInt(emp_id));
            statusSummaryParamIndex++;
        }
        statusSummaryQuery += ` GROUP BY status`;

        // Execute the status summary query
        const statusSummary = await client.query(statusSummaryQuery, statusSummaryParams); // Use client here

        // Convert the status summary rows into a more accessible object format
        const statusCounts = statusSummary.rows.reduce((acc, row) => {
            acc[row.status] = parseInt(row.count);
            return acc;
        }, {});

        // Send the successful response with bookings, pagination, filters, sorting, and summary
        res.status(200).json({
            message: `Bookings for customer ID ${customer_id} retrieved successfully`,
            bookings: bookings,
            pagination: {
                total_records: totalCount,
                total_pages: totalPages,
                current_page: currentPage,
                records_per_page: limitNum,
                has_next_page: hasNextPage,
                has_prev_page: hasPrevPage
            },
            filters_applied: {
                customer_id: customer_id, // Explicitly show customer_id filter
                status: status || 'all',
                date: date || 'all',
                shop_id: shop_id || 'all',
                emp_id: emp_id || 'all'
            },
            sorting: {
                sort_by: sortBy,
                sort_order: sortOrder
            },
            summary: {
                total_bookings_for_customer: totalCount,
                status_breakdown: statusCounts,
                last_status_update: dayjs().tz(IST_TIMEZONE).toISOString() // Timestamp of when statuses were last updated/fetched in IST
            }
        });

    } catch (error) {
        // Log the error for debugging purposes
        console.error(`Error fetching bookings for customer ID ${customer_id}:`, error);
        // Send an error response to the client
        res.status(500).json({
            error: 'Server error while fetching bookings for the customer',
            // Provide more details in development environment for easier debugging
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (client) client.release();
    }
});

// Get all bookings with filters and automatic status updates
// Changed to POST request to allow sending filters in the request body
app.post('/getAllBookings', async (req, res) => {
    const { 
        status, 
        date, 
        shop_id, 
        emp_id, 
        customer_id, 
        limit = 50, 
        offset = 0,
        sort_by = 'join_time',
        sort_order = 'DESC'
    } = req.body; // Changed from req.query to req.body

    // Validate limit and offset
    const limitNum = Math.min(Math.max(parseInt(limit) || 50, 1), 100); // Max 100 records
    const offsetNum = Math.max(parseInt(offset) || 0, 0);

    // Validate sort parameters
    const validSortFields = ['join_time', 'end_time', 'status', 'shop_name', 'emp_name'];
    const validSortOrders = ['ASC', 'DESC'];
    const sortBy = validSortFields.includes(sort_by) ? sort_by : 'join_time';
    const sortOrder = validSortOrders.includes(sort_order?.toUpperCase()) ? sort_order.toUpperCase() : 'DESC';

    let client;
    try {
        client = await pool.connect();

        // Define currentTime at the beginning of the route handler
        const currentTime = dayjs().tz(IST_TIMEZONE).toDate(); // Use IST current time

        // Update statuses first (assumes updateBookingStatuses is defined elsewhere and accessible)
        // This ensures booking statuses are up-to-date before fetching.
        await updateBookingStatuses();

        // Build dynamic query
       let query = `
    SELECT
        b.*,
        s.shop_name,
        s.address as shop_address,
        e.emp_name,
        c.customer_name,
        c.customer_ph_number 
    FROM bookings b
    JOIN shops s ON b.shop_id = s.shop_id
    JOIN employees e ON b.emp_id = e.emp_id
    JOIN customers c ON b.customer_id = c.customer_id
    WHERE 1=1
`;
        
        const queryParams = [];
        let paramIndex = 1; // Start parameter index at 1

        // Add filters
        if (status && ['booked', 'in_service', 'completed', 'cancelled'].includes(status)) {
            query += ` AND b.status = $${paramIndex}`;
            queryParams.push(status);
            paramIndex++;
        }

        if (date) {
            const dateObj = dayjs(date).tz(IST_TIMEZONE).toDate(); // Treat input date as IST
            if (!isNaN(dateObj.getTime())) {
                query += ` AND DATE(b.join_time) = DATE($${paramIndex})`;
                queryParams.push(dateObj);
                paramIndex++;
            }
        }

        // Filter by shop_id if provided
        if (shop_id && Number.isInteger(parseInt(shop_id))) {
            query += ` AND b.shop_id = $${paramIndex}`;
            queryParams.push(parseInt(shop_id));
            paramIndex++;
        }

        if (emp_id && Number.isInteger(parseInt(emp_id))) {
            query += ` AND b.emp_id = $${paramIndex}`;
            queryParams.push(parseInt(emp_id));
            paramIndex++;
        }

        if (customer_id && Number.isInteger(parseInt(customer_id))) {
            query += ` AND b.customer_id = $${paramIndex}`;
            queryParams.push(parseInt(customer_id));
            paramIndex++;
        }

        // Add sorting
        if (sortBy === 'shop_name') {
            query += ` ORDER BY s.shop_name ${sortOrder}`;
        } else if (sortBy === 'emp_name') {
            query += ` ORDER BY e.emp_name ${sortOrder}`;
        } else {
            query += ` ORDER BY b.${sortBy} ${sortOrder}`;
        }

        // Add pagination
        query += ` LIMIT $${paramIndex}`;
        queryParams.push(limitNum);
        paramIndex++;
        
        query += ` OFFSET $${paramIndex}`;
        queryParams.push(offsetNum);

        // Execute main query
        const result = await client.query(query, queryParams); // Use client here

        // Get total count for pagination (using the same filters)
        let countQuery = `
            SELECT COUNT(*) as total
            FROM bookings b
            JOIN shops s ON b.shop_id = s.shop_id
            JOIN employees e ON b.emp_id = e.emp_id
            JOIN customers c ON b.customer_id = c.customer_id
            WHERE 1=1
        `;
        
        const countParams = [];
        let countParamIndex = 1;

        if (status && ['booked', 'in_service', 'completed', 'cancelled'].includes(status)) {
            countQuery += ` AND b.status = $${countParamIndex}`;
            countParams.push(status);
            countParamIndex++;
        }

        if (date) {
            const dateObj = dayjs(date).tz(IST_TIMEZONE).toDate(); // Treat input date as IST
            if (!isNaN(dateObj.getTime())) {
                countQuery += ` AND DATE(b.join_time) = DATE($${countParamIndex})`;
                countParams.push(dateObj);
                countParamIndex++;
            }
        }

        if (shop_id && Number.isInteger(parseInt(shop_id))) {
            countQuery += ` AND b.shop_id = $${countParamIndex}`;
            countParams.push(parseInt(shop_id));
            countParamIndex++;
        }

        if (emp_id && Number.isInteger(parseInt(emp_id))) {
            countQuery += ` AND b.emp_id = $${countParamIndex}`;
            countParams.push(parseInt(emp_id));
            countParamIndex++;
        }

        if (customer_id && Number.isInteger(parseInt(customer_id))) {
            countQuery += ` AND b.customer_id = $${countParamIndex}`;
            countParams.push(parseInt(customer_id));
            paramIndex++;
        }

        const countResult = await client.query(countQuery, countParams); // Use client here
        const totalCount = parseInt(countResult.rows[0].total);

        // Process and format booking data
        const bookings = result.rows.map(booking => {
            // Calculate time information based on status
            let timeInfo = {};
            const joinTime = dayjs(booking.join_time).tz(IST_TIMEZONE).toDate(); // Convert to IST
            const endTime = dayjs(booking.end_time).tz(IST_TIMEZONE).toDate(); // Convert to IST

            if (booking.status === 'booked') {
                const timeUntilStart = Math.max(0, Math.ceil((joinTime.getTime() - currentTime.getTime()) / (1000 * 60)));
                timeInfo = {
                    time_until_service: timeUntilStart + ' minutes',
                    estimated_start: dayjs(joinTime).format('hh:mm A')
                };
            } else if (booking.status === 'in_service') {
                const timeUntilEnd = Math.max(0, Math.ceil((endTime.getTime() - currentTime.getTime()) / (1000 * 60)));
                timeInfo = {
                    time_remaining: timeUntilEnd + ' minutes',
                    estimated_completion: dayjs(endTime).format('hh:mm A')
                };
            } else if (booking.status === 'completed') {
                timeInfo = {
                    completed_at: dayjs(endTime).format('MMM DD, YYYY - hh:mm A'),
                    duration_was: booking.service_duration_minutes + ' minutes'
                };
            }

            return {
                ...booking,
                formatted_times: {
                    join_time: dayjs(joinTime).format('YYYY-MM-DD HH:mm:ss'),
                    end_time: dayjs(endTime).format('YYYY-MM-DD HH:mm:ss'),
                    join_time_display: dayjs(joinTime).format('MMM DD, YYYY - hh:mm A'),
                    end_time_display: dayjs(endTime).format('MMM DD, YYYY - hh:mm A')
                },
                ...timeInfo
            };
        });

        // Calculate pagination info
        const totalPages = Math.ceil(totalCount / limitNum);
        const currentPage = Math.floor(offsetNum / limitNum) + 1;
        const hasNextPage = offsetNum + limitNum < totalCount;
        const hasPrevPage = offsetNum > 0;

        // Construct status summary query and parameters
        let statusSummaryQuery = `
            SELECT status, COUNT(*) as count
            FROM bookings b
            WHERE 1=1
        `;
        const statusSummaryParams = [];
        let statusSummaryParamIndex = 1;

        if (date) {
            statusSummaryQuery += ` AND DATE(b.join_time) = DATE($${statusSummaryParamIndex})`;
            statusSummaryParams.push(dayjs(date).tz(IST_TIMEZONE).toDate()); // Treat input date as IST
            statusSummaryParamIndex++;
        }
        if (shop_id && Number.isInteger(parseInt(shop_id))) {
            statusSummaryQuery += ` AND b.shop_id = $${statusSummaryParamIndex}`;
            statusSummaryParams.push(parseInt(shop_id));
            statusSummaryParamIndex++;
        }
        if (emp_id && Number.isInteger(parseInt(emp_id))) {
            statusSummaryQuery += ` AND b.emp_id = $${statusSummaryParamIndex}`;
            statusSummaryParams.push(parseInt(emp_id));
            statusSummaryParamIndex++;
        }
        if (customer_id && Number.isInteger(parseInt(customer_id))) {
            statusSummaryQuery += ` AND b.customer_id = $${statusSummaryParamIndex}`;
            statusSummaryParams.push(parseInt(customer_id));
            statusSummaryParamIndex++;
        }
        statusSummaryQuery += ` GROUP BY status`;


        const statusSummary = await client.query(statusSummaryQuery, statusSummaryParams); // Use client here

        const statusCounts = statusSummary.rows.reduce((acc, row) => {
            acc[row.status] = parseInt(row.count);
            return acc;
        }, {});

        res.status(200).json({
            message: 'All bookings retrieved successfully',
            bookings: bookings,
            pagination: {
                total_records: totalCount,
                total_pages: totalPages,
                current_page: currentPage,
                records_per_page: limitNum,
                has_next_page: hasNextPage,
                has_prev_page: hasPrevPage
            },
            filters_applied: {
                status: status || 'all',
                date: date || 'all',
                shop_id: shop_id || 'all',
                emp_id: emp_id || 'all',
                customer_id: customer_id || 'all'
            },
            sorting: {
                sort_by: sortBy,
                sort_order: sortOrder
            },
            summary: {
                total_bookings: totalCount,
                status_breakdown: statusCounts,
                last_status_update: dayjs().tz(IST_TIMEZONE).toISOString() // Timestamp of when statuses were last updated/fetched in IST
            }
        });

    } catch (error) {
        console.error('Error fetching all bookings:', error);
        res.status(500).json({ 
            error: 'Server error while fetching bookings',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (client) client.release();
    }
});

app.put('/shops/:shop_id/status', async (req, res) => {
    const { shop_id } = req.params;
    const { is_active } = req.body; // Expecting a boolean true/false

    // Validate shop_id to ensure it's a positive integer
    if (!Number.isInteger(parseInt(shop_id)) || parseInt(shop_id) <= 0) {
        return res.status(400).json({ error: 'shop_id must be a positive integer.' });
    }

    // Validate is_active to ensure it's a boolean
    if (typeof is_active !== 'boolean') {
        return res.status(400).json({ error: 'is_active must be a boolean (true/false).' });
    }

    let client;
    try {
        client = await pool.connect();

        // Update the 'is_active' status for the specified shop_id
        const result = await client.query(
            `UPDATE shops SET is_active = $1 WHERE shop_id = $2 RETURNING *`,
            [is_active, parseInt(shop_id)]
        );

        // If no rows were affected, the shop was not found
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Shop not found.' });
        }

        // Respond with success message and the updated shop details
        res.status(200).json({
            message: `Shop status updated to ${is_active ? 'active' : 'inactive'} successfully.`,
            shop: result.rows[0]
        });
    } catch (error) {
        // Log any errors that occur during the update process
        console.error('Error updating shop status:', error);
        // Return a generic server error
        res.status(500).json({ error: 'Server error while updating shop status.' });
    } finally {
        if (client) client.release();
    }
});


// Update Employee Status (Active/Inactive)
app.put('/employees/:emp_id/status', async (req, res) => {
    const { emp_id } = req.params;
    const { is_active } = req.body; // Expecting a boolean true/false

    // Validate emp_id
    if (!Number.isInteger(parseInt(emp_id)) || parseInt(emp_id) <= 0) {
        return res.status(400).json({ error: 'emp_id must be a positive integer.' });
    }

    // Validate is_active
    if (typeof is_active !== 'boolean') {
        return res.status(400).json({ error: 'is_active must be a boolean (true/false).' });
    }

    let client;
    try {
        client = await pool.connect();

        const result = await client.query(
            `UPDATE employees SET is_active = $1 WHERE emp_id = $2 RETURNING *`,
            [is_active, parseInt(emp_id)]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Employee not found.' });
        }

        res.status(200).json({
            message: `Employee status updated to ${is_active ? 'active' : 'inactive'} successfully.`,
            employee: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating employee status:', error);
        res.status(500).json({ error: 'Server error while updating employee status.' });
    } finally {
        if (client) client.release();
    }
});


// Health check route - This is the route that Vercel will hit to confirm your deployment is successful.
// It will also be the route you can visit to see the success message.
app.get('/', (req, res) => {
    res.status(200).send('TrimTadka backend running successfully');
});

// Start the server
// For Vercel, you don't need to explicitly call app.listen() if you export the app.
// Vercel's build process handles starting the server.
// However, keeping it for local development is fine.
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// Export the app for Vercel
module.exports = app;
