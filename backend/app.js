
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const haversine = require("haversine-distance");
const dayjs = require('dayjs'); // For easy time manipulation
const utc = require('dayjs/plugin/utc'); // Import UTC plugin
const timezone = require('dayjs/plugin/timezone'); // Import Timezone plugin
require('dotenv').config(); // Load environment variables from .env file
const cors = require('cors'); // Import the CORS middleware
const Razorpay = require('razorpay');
const axios = require('axios');

// Extend Day.js with UTC and Timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Set the default timezone for Day.js to Asia/Kolkata (IST)
// All dayjs().format() calls will now output in IST unless explicitly overridden
dayjs.tz.setDefault('Asia/Kolkata');

// Initialize Express app
const app = express();

const port = process.env.PORT || 5000; // Use port from environment variable or default to 3000

// Ensure you are loading these from your environment variables
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});
// CORS middleware to allow requests from Hoppscotch web
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});
app.use(cors());
// Middleware to parse JSON request bodies
app.use(express.json());

// Database connection pool configuration
// Ensure your .env file has DATABASE_URL and JWT_SECRET
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Explicitly set SSL options.
    // `rejectUnauthorized: false` allows connections to databases with self-signed certificates.
    // This is common in development or with some cloud providers where you don't manage the CA cert.
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
pool.connect((err, client, release) => {
    if (err) {
        // Provide more specific guidance for ETIMEDOUT errors
        if (err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
            console.error('Database connection failed: ETIMEDOUT or ENOTFOUND. This usually means:');
            console.error('1. Your DATABASE_URL in .env might be incorrect or have typos.');
            console.error('2. Your network/firewall might be blocking the connection to Supabase.');
            console.error('3. Supabase IP allowlisting might be enabled, and your IP is not whitelisted.');
            console.error('Please check your .env file and Supabase project settings (Database -> Network).');
            console.error('Expected format: postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres');
        }
        return console.error('Error acquiring client:', err.stack);
    }
    console.log('Successfully connected to the database!');
    release(); // Release the client back to the pool
});

// Secret key for JWT token generation.
// IMPORTANT: Use a strong, unique secret in production and keep it secure.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('JWT_SECRET is not defined in environment variables. Please set it.');
    process.exit(1); // Exit if secret is not set
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

// Utility function to calculate estimated wait time
function calculateWaitTime(queue, durations) {
    return queue.reduce((sum, booking) => {
        return sum + (booking.service_duration_minutes || 0);
    }, 0);
}

// Health check route
app.get('/health', (req, res) => {
    res.status(200).json({ 
        message: 'TrimTadka backend running successfully', // Updated message
        timestamp: dayjs().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss [IST]'), // Formatted in IST
        port: port
    });
});

const webpush = require('web-push');

// VAPID keys for push notifications
// VAPID Keys for Web Push Notifications
// IMPORTANT: Replace with your actual VAPID keys from environment variables
const vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
};

webpush.setVapidDetails(
    'mailto:sourjya1614@gmail.com', // CORRECTED: Changed to a mailto: URL
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
            `DELETE FROM shop_push_subscriptions WHERE shop_id = $1`,
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
            // If passwords do not match, return an unauthorized error
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
        timestamp: dayjs().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss [IST]') // Formatted in IST
    });
});



app.get('/myshop/:shop_id', async (req, res) => {
    const shopId = req.params.shop_id;

    if (!shopId) {
        return res.status(400).json({ message: 'Shop ID is required.' });
    }

    try {
        const result = await pool.query(
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
    }
});
// Get all active shops (public route)
app.get('/shops', async (req, res) => {
    try {
        const result = await pool.query(
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
    }
});


// Get shops with detailed barber info & queue status (simplified route)
// Assuming 'pool' is your PostgreSQL connection pool.
// If you're using 'dayjs' and 'haversine' in your backend, ensure they are imported/defined:
// const dayjs = require('dayjs'); // Example if you're using dayjs for formatting dates on the backend
// const haversine = require('haversine'); // Example if you have a haversine implementation

app.get('/shops/simple', async (req, res) => {
    const { customer_id, lat, long } = req.query;
    const TOMTOM_API_KEY = '5Q9lucwONUWC0yrXWheR16oZtjdBxE0H'; // Replace with your actual API key

    try {
        // ... (shopsQuery and shopsResult remain the same) ...
        const shopsQuery = `
            SELECT 
                s.shop_id,
                s.shop_name,
                s.lat,
                s.long,
                s.address,
                s.ph_number,
                s.is_active AS shop_is_active,
                e.emp_id,
                e.emp_name,
                e.is_active AS emp_is_active,
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
            LEFT JOIN employees e ON s.shop_id = e.shop_id
            LEFT JOIN employee_services es ON e.emp_id = es.emp_id
            LEFT JOIN services srv ON es.service_id = srv.service_id
            GROUP BY s.shop_id, s.shop_name, s.lat, s.long, s.address, s.ph_number, s.is_active, e.emp_id, e.emp_name, e.is_active
            ORDER BY s.shop_name, e.emp_name
        `;

        const shopsResult = await pool.query(shopsQuery);
        
        // ... (bookingsQuery and bookingsResult remain the same) ...
        const currentTime = dayjs().utc().toDate();
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
            AND b.end_time > $1
            ORDER BY b.join_time ASC
        `;
        
        const bookingsResult = await pool.query(bookingsQuery, [currentTime]);
        const bookings = bookingsResult.rows;

        // ... (shopsMap creation and queue logic remain the same) ...
        const shopsMap = new Map();
        
        shopsResult.rows.forEach(row => {
            if (!shopsMap.has(row.shop_id)) {
                shopsMap.set(row.shop_id, {
                    shop_id: row.shop_id,
                    shop_name: row.shop_name,
                    ph_number: row.ph_number,
                    is_active: row.shop_is_active,
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
            
            if (row.emp_id && !shop.barbers.some(b => b.emp_id === row.emp_id)) {
                const empBookings = bookings.filter(b => b.emp_id === row.emp_id);
                
                const totalInQueue = empBookings.length;
                const inServiceBooking = empBookings.find(b => b.status === 'in_service');
                
                let finalEstimatedWaitTime = 0;
                let lastBookingEndTime = currentTime;
                
                const sortedActiveBookings = empBookings
                    .sort((a, b) => dayjs.utc(a.join_time).toDate().getTime() - dayjs.utc(b.join_time).toDate().getTime());
                    
                for (let i = 0; i < sortedActiveBookings.length; i++) {
                    const booking = sortedActiveBookings[i];
                    const bookingJoinTime = dayjs.utc(booking.join_time).toDate();
                    const bookingEndTime = dayjs.utc(booking.end_time).toDate();
                    
                    if (booking.status === 'in_service') {
                        lastBookingEndTime = new Date(Math.max(lastBookingEndTime.getTime(), bookingEndTime.getTime() + 5 * 60000));
                    } else if (booking.status === 'booked') {
                        const potentialStartTimeAfterPrevious = new Date(lastBookingEndTime.getTime());
                        const actualStartTimeForThisBooking = new Date(Math.max(bookingJoinTime.getTime(), potentialStartTimeAfterPrevious.getTime()));
                        lastBookingEndTime = new Date(actualStartTimeForThisBooking.getTime() + (booking.service_duration_minutes || 0) * 60000 + 5 * 60000);
                    }
                }
                finalEstimatedWaitTime = Math.max(0, Math.ceil((lastBookingEndTime.getTime() - currentTime.getTime()) / (1000 * 60)));

                let customerBooking = null;
                let customerQueuePosition = null;
                
                if (customer_id) {
                    customerBooking = empBookings.find(b => 
                        b.customer_id === parseInt(customer_id) && b.status !== 'completed' && b.status !== 'cancelled'
                    );
                    
                    if (customerBooking) {
                        customerQueuePosition = sortedActiveBookings.findIndex(b => 
                            b.booking_id === customerBooking.booking_id
                        ) + 1;
                    }
                }

                const barber = {
                    emp_id: row.emp_id,
                    emp_name: row.emp_name,
                    is_active: row.emp_is_active,
                    services: Array.isArray(row.services) ? row.services : [],
                    queue_info: {
                        total_people_in_queue: totalInQueue,
                        queue_position: totalInQueue + 1,
                        estimated_wait_time: finalEstimatedWaitTime > 0 ? `${finalEstimatedWaitTime} mins` : "No wait",
                        current_status: inServiceBooking ? 
                            `Serving ${inServiceBooking.customer_name}` : 
                            (totalInQueue > 0 ? "Ready for next customer" : "Available"),
                        ...(customerQueuePosition !== null && { customer_queue_position: customerQueuePosition })
                    }
                };

                if (customerBooking) {
                    const joinTimeIST = dayjs.utc(customerBooking.join_time).tz('Asia/Kolkata');
                    const endTimeIST = dayjs.utc(customerBooking.end_time).tz('Asia/Kolkata');
                    
                    barber.your_booking = {
                        booking_id: customerBooking.booking_id,
                        join_time: joinTimeIST.format('HH:mm'),
                        service_duration: `${customerBooking.service_duration_minutes} mins`,
                        expected_end_time: endTimeIST.format('HH:mm'),
                        status: customerBooking.status,
                        services: customerBooking.service_type
                    };
                }

                shop.barbers.push(barber);
            }
        });

        const shops = Array.from(shopsMap.values());
        
        if (lat && long) {
            const userLat = parseFloat(lat);
            const userLong = parseFloat(long);

            const distancePromises = shops.map(async shop => {
                const shopLat = shop.location.coordinates.lat;
                const shopLong = shop.location.coordinates.long;

                if (shopLat && shopLong) {
                    const url = `https://api.tomtom.com/routing/1/calculateRoute/${userLat},${userLong}:${shopLat},${shopLong}/json?key=${TOMTOM_API_KEY}&routeType=fastest&travelMode=car&traffic=true`;
                    
                    try {
                        const response = await axios.get(url);
                        const data = response.data;
                        const route = data.routes[0];
                        if (route) {
                            const distanceInMeters = route.summary.lengthInMeters;
                            shop.location.distance_from_you = `${(distanceInMeters / 1000).toFixed(1)} km`;
                        } else {
                            shop.location.distance_from_you = "Distance unavailable";
                        }
                    } catch (apiError) {
                        console.error(`Error fetching TomTom data for shop ${shop.shop_id}:`, apiError.message);
                        shop.location.distance_from_you = "Distance unavailable";
                    }
                } else {
                    shop.location.distance_from_you = "Distance unavailable";
                }
            });

            await Promise.all(distancePromises);
            
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
            timestamp: dayjs().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss [IST]')
        });

    } catch (error) {
        console.error('Error fetching shops with barber details:', error);
        res.status(500).json({ 
            error: 'Server error while fetching shops with barber details',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});



// Get shops with detailed barber info & queue status (renamed to /shop_status and changed to POST)
// Get shops with detailed barber info & queue status (renamed to /shop_status and changed to POST)
// Assuming 'pool' is your PostgreSQL connection pool and 'dayjs' and 'haversine' are imported if used.
// Example imports if not already present:
// const dayjs = require('dayjs');
// const haversine = require('haversine'); // You'd need to implement or import this function

app.post('/shop_status', async (req, res) => {
    const { customer_id, lat, long, shop_id } = req.body;
    const TOMTOM_API_KEY = '5Q9lucwONUWC0yrXWheR16oZtjdBxE0H'; // Replace with your actual API key

    try {
        if (!shop_id || !Number.isInteger(parseInt(shop_id))) {
            return res.status(400).json({ error: 'shop_id is required and must be a positive integer in the request body.' });
        }
        const parsedShopId = parseInt(shop_id);

        let shopsQuery = `
            SELECT 
                s.shop_id,
                s.shop_name,
                s.lat,
                s.long,
                s.address,
                s.ph_number,
                s.is_active AS shop_is_active,
                e.emp_id,
                e.emp_name,
                e.is_active AS emp_is_active,
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
            LEFT JOIN employees e ON s.shop_id = e.shop_id
            LEFT JOIN employee_services es ON e.emp_id = es.emp_id
            LEFT JOIN services srv ON es.service_id = srv.service_id
            WHERE s.shop_id = $1
            GROUP BY s.shop_id, s.shop_name, s.lat, s.long, s.address, s.ph_number, s.is_active, e.emp_id, e.emp_name, e.is_active
            ORDER BY s.shop_name, e.emp_name
        `;

        const shopsResult = await pool.query(shopsQuery, [parsedShopId]);

        if (shopsResult.rows.length === 0) {
            return res.status(404).json({ message: 'Shop not found.' });
        }
        
        const currentTime = dayjs().utc().toDate();
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
            AND b.shop_id = $1
            AND b.end_time > $2
            ORDER BY b.join_time ASC
        `;
        
        const bookingsResult = await pool.query(bookingsQuery, [parsedShopId, currentTime]);
        const bookings = bookingsResult.rows;

        const shopsMap = new Map();
        
        shopsResult.rows.forEach(row => {
            if (!shopsMap.has(row.shop_id)) {
                shopsMap.set(row.shop_id, {
                    shop_id: row.shop_id,
                    shop_name: row.shop_name,
                    ph_number: row.ph_number,
                    is_active: row.shop_is_active,
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
            
            if (row.emp_id && !shop.barbers.some(b => b.emp_id === row.emp_id)) {
                const empBookings = bookings.filter(b => b.emp_id === row.emp_id);
                
                const totalInQueue = empBookings.length;
                const inServiceBooking = empBookings.find(b => b.status === 'in_service');
                
                let finalEstimatedWaitTime = 0;
                let lastBookingEndTime = currentTime;

                const sortedActiveBookings = empBookings
                    .sort((a, b) => dayjs.utc(a.join_time).toDate().getTime() - dayjs.utc(b.join_time).toDate().getTime());

                for (let i = 0; i < sortedActiveBookings.length; i++) {
                    const booking = sortedActiveBookings[i];
                    const bookingJoinTime = dayjs.utc(booking.join_time).toDate();
                    const bookingEndTime = dayjs.utc(booking.end_time).toDate();

                    if (booking.status === 'in_service') {
                        lastBookingEndTime = new Date(Math.max(lastBookingEndTime.getTime(), bookingEndTime.getTime() + 5 * 60000));
                    } else if (booking.status === 'booked') {
                        const potentialStartTimeAfterPrevious = new Date(lastBookingEndTime.getTime());
                        const actualStartTimeForThisBooking = new Date(Math.max(bookingJoinTime.getTime(), potentialStartTimeAfterPrevious.getTime()));
                        lastBookingEndTime = new Date(actualStartTimeForThisBooking.getTime() + (booking.service_duration_minutes || 0) * 60000 + 5 * 60000);
                    }
                }
                finalEstimatedWaitTime = Math.max(0, Math.ceil((lastBookingEndTime.getTime() - currentTime.getTime()) / (1000 * 60)));

                let customerBooking = null;
                let customerQueuePosition = null;
                
                if (customer_id) {
                    customerBooking = empBookings.find(b => 
                        b.customer_id === parseInt(customer_id) && b.status !== 'completed' && b.status !== 'cancelled'
                    );
                    
                    if (customerBooking) {
                        customerQueuePosition = sortedActiveBookings.findIndex(b => 
                            b.booking_id === customerBooking.booking_id
                        ) + 1;
                    }
                }

                const barber = {
                    emp_id: row.emp_id,
                    emp_name: row.emp_name,
                    is_active: row.emp_is_active,
                    services: Array.isArray(row.services) ? row.services : [],
                    queue_info: {
                        total_people_in_queue: totalInQueue,
                        queue_position: totalInQueue + 1,
                        estimated_wait_time: finalEstimatedWaitTime > 0 ? `${finalEstimatedWaitTime} mins` : "No wait",
                        current_status: inServiceBooking ? 
                            `Serving ${inServiceBooking.customer_name}` : 
                            (totalInQueue > 0 ? "Ready for next customer" : "Available"),
                        ...(customerQueuePosition !== null && { customer_queue_position: customerQueuePosition })
                    }
                };

                if (customerBooking) {
                    const joinTimeIST = dayjs.utc(customerBooking.join_time).tz('Asia/Kolkata');
                    const endTimeIST = dayjs.utc(customerBooking.end_time).tz('Asia/Kolkata');
                    
                    barber.your_booking = {
                        booking_id: customerBooking.booking_id,
                        join_time: joinTimeIST.format('HH:mm'),
                        service_duration: `${customerBooking.service_duration_minutes} mins`,
                        expected_end_time: endTimeIST.format('HH:mm'),
                        status: customerBooking.status,
                        services: customerBooking.service_type
                    };
                }
                shop.barbers.push(barber);
            }
        });

        const shops = Array.from(shopsMap.values());
        
        if (lat && long) {
            const userLat = parseFloat(lat);
            const userLong = parseFloat(long);

            const distancePromises = shops.map(async shop => {
                const shopLat = shop.location.coordinates.lat;
                const shopLong = shop.location.coordinates.long;

                if (shopLat && shopLong) {
                    const url = `https://api.tomtom.com/routing/1/calculateRoute/${userLat},${userLong}:${shopLat},${shopLong}/json?key=${TOMTOM_API_KEY}&routeType=fastest&travelMode=car&traffic=true`;
                    
                    try {
                        const response = await axios.get(url);
                        const data = response.data;
                        const route = data.routes[0];
                        if (route) {
                            const distanceInMeters = route.summary.lengthInMeters;
                            shop.location.distance_from_you = `${(distanceInMeters / 1000).toFixed(1)} km`;
                        } else {
                            shop.location.distance_from_you = "Distance unavailable";
                        }
                    } catch (apiError) {
                        console.error(`Error fetching TomTom data for shop ${shop.shop_id}:`, apiError.message);
                        shop.location.distance_from_you = "Distance unavailable";
                    }
                } else {
                    shop.location.distance_from_you = "Distance unavailable";
                }
            });

            await Promise.all(distancePromises);
            
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
            timestamp: dayjs().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss [IST]')
        });

    } catch (error) {
        console.error('Error fetching shops with barber details:', error);
        res.status(500).json({ 
            error: 'Server error while fetching shops with barber details',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
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

    try {
        const result = await pool.query(
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
    }
});

// Get all available services
app.get('/services', async (req, res) => {
    try {
        const result = await pool.query(
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
    }
});


app.delete('/delete_employee/:shop_id/:emp_id', async (req, res) => {
    // Extract parameters from the request URL
    const { shop_id, emp_id } = req.params;

    // --- Input Validation ---
    // Validate shop_id
    if (!shop_id || !Number.isInteger(Number(shop_id)) || Number(shop_id) <= 0) {
        return res.status(400).json({
            error: 'Invalid shop_id. It must be a positive integer.'
        });
    }

    // Validate emp_id
    if (!emp_id || !Number.isInteger(Number(emp_id)) || Number(emp_id) <= 0) {
        return res.status(400).json({
            error: 'Invalid emp_id. It must be a positive integer.'
        });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // --- Step 1: Verify employee existence and ownership ---
        // This query checks if the employee with emp_id exists and belongs to the provided shop_id.
        const employeeCheck = await client.query(
            `SELECT emp_id FROM employees WHERE emp_id = $1 AND shop_id = $2`,
            [emp_id, shop_id]
        );

        if (employeeCheck.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                error: `Employee with ID ${emp_id} not found in shop with ID ${shop_id}.`
            });
        }
        
        // --- Step 2: Delete associated services (optional, but good practice) ---
        // If your database has ON DELETE CASCADE on the foreign key, this step is redundant.
        // However, explicitly deleting related records ensures the data is clean regardless of the schema.
        await client.query(
            `DELETE FROM employee_services WHERE emp_id = $1`,
            [emp_id]
        );

        // --- Step 3: Delete the employee from the employees table ---
        const deleteResult = await client.query(
            `DELETE FROM employees WHERE emp_id = $1 AND shop_id = $2`,
            [emp_id, shop_id]
        );
        
        if (deleteResult.rowCount === 0) {
            // This should not happen if the employeeCheck passed, but it's a good final safeguard.
            await client.query('ROLLBACK');
            return res.status(404).json({
                error: `Employee with ID ${emp_id} was not deleted.`
            });
        }
        
        // --- Step 4: Commit the transaction if all operations were successful ---
        await client.query('COMMIT');
        
        // --- Step 5: Send a success response ---
        res.status(200).json({
            message: `Employee with ID ${emp_id} has been successfully deleted.`
        });

    } catch (err) {
        // --- Rollback the transaction on any error ---
        await client.query('ROLLBACK');
        
        console.error('Error deleting employee:', err);
        res.status(500).json({
            error: 'Server error while deleting employee.'
        });
    } finally {
        // Always release the client back to the pool
        client.release();
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

    try {
        const result = await pool.query(`
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
    }
});

// Book a service - Create a new booking

// Utility function to update booking statuses based on current time
// This is a conceptual example of your updateBookingStatuses function.
// You need to integrate this logic into your actual function's implementation.
async function updateBookingStatuses() {
    console.log('Running updateBookingStatuses to check for changes and send notifications...');
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN'); // Start transaction

        const currentTime = dayjs().utc().toDate(); // Get current time in UTC

        // 1. Update 'booked' to 'in_service'
        const inServiceResult = await client.query(
            `UPDATE bookings
             SET status = 'in_service'
             WHERE status = 'booked' AND join_time <= $1
             RETURNING booking_id, customer_id, shop_id, emp_id;`, // Added emp_id and shop_id
            [currentTime]
        );

        for (const row of inServiceResult.rows) {
            console.log(`Booking ${row.booking_id} changed to in_service.`);
            // Notify Customer
            if (row.customer_id) { 
                await sendNotificationToCustomer(row.customer_id, {
                    title: 'Your Service Has Started!',
                    body: `Your booking (ID: ${row.booking_id}) is now in service.`,
                    url: `/userdashboard`,
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
                    url: `/shopdashboard`,
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
            [currentTime]
        );

        for (const row of completedResult.rows) {
            console.log(`Booking ${row.booking_id} changed to completed.`);
            // Notify Customer
            if (row.customer_id) { 
                await sendNotificationToCustomer(row.customer_id, {
                    title: 'Service Completed!',
                    body: `Your service for booking (ID: ${row.booking_id}) has been completed.`,
                    url: `/userdashboard`,
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
                    url: `/shopdashboard`,
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
            [currentTime]
        );

        for (const row of missedResult.rows) {
            console.log(`Booking ${row.booking_id} changed to cancelled (missed appointment).`);
            // Notify Customer
            if (row.customer_id) {
                await sendNotificationToCustomer(row.customer_id, {
                    title: 'Appointment Missed',
                    body: `Your booking (ID: ${row.booking_id}) at Shop ${row.shop_id} was cancelled as you missed your appointment.`,
                    url: `/userdashboard`,
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
                    url: `/shopdashboard`,
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
setInterval(updateBookingStatuses, 60000); // Run every 60 seconds

// Book a service - Create a new booking with automatic timing
// Book a service - Create a new booking with automatic timing
// Book a service - Create a new booking with automatic timing



app.post('/create-razorpay-order', async (req, res) => {
    try {
        const { amount } = req.body;
        const options = {
            amount: amount, // Amount is in currency subunits (e.g., 300 for ₹3)
            currency: 'INR',
            receipt: 'receipt_order_' + Math.random().toString(36).substring(7),
        };

        const order = await razorpay.orders.create(options);
        console.log("Razorpay Order Created:", order);
        res.status(200).json(order);
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.status(500).json({ error: 'Failed to create Razorpay order' });
    }
});

app.put('/customers/:customer_id/sync-completed-bookings', async (req, res) => {
  const { customer_id } = req.params;

  if (!customer_id || isNaN(parseInt(customer_id))) {
    return res.status(400).json({ error: 'Valid customer_id is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Count the number of completed bookings for the customer
    const countResult = await client.query(
      `SELECT COUNT(*) FROM bookings WHERE customer_id = $1 AND status = 'completed'`,
      [customer_id]
    );
    const completedBookingsCount = parseInt(countResult.rows[0].count);

    // 2. Update the customer's record with the new count
    const updateCustomerQuery = `
      UPDATE customers
      SET bookings_completed = $1
      WHERE customer_id = $2
      RETURNING *;
    `;
    const updateResult = await client.query(updateCustomerQuery, [completedBookingsCount, customer_id]);

    if (updateResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Customer not found' });
    }

    await client.query('COMMIT');

    res.status(200).json({
      message: `Bookings completed count for customer ID ${customer_id} updated to ${completedBookingsCount}`,
      customer: updateResult.rows[0],
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to sync completed bookings count:', err.message);
    res.status(500).json({
      error: 'Failed to sync completed bookings count',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  } finally {
    client.release();
  }
});


app.get('/customers/:customer_id/wallet', async (req, res) => {
  const { customer_id } = req.params;

  if (!customer_id || isNaN(parseInt(customer_id))) {
    return res.status(400).json({ error: 'Valid customer_id is required' });
  }

  const client = await pool.connect();
  try {
    // Fetch the balance from the transaction with the largest ID
    const balanceResult = await client.query(
      `SELECT balance FROM wallet_transactions WHERE customer_id = $1 ORDER BY id DESC LIMIT 1`,
      [customer_id]
    );
    const currentBalance = balanceResult.rows.length > 0 ? balanceResult.rows[0].balance : 0;

    // Fetch all transactions for the customer, ordered by time
    const transactionsResult = await client.query(
      `SELECT * FROM wallet_transactions WHERE customer_id = $1 ORDER BY created_at DESC`,
      [customer_id]
    );

    res.status(200).json({
      message: `Wallet details for customer ID ${customer_id} retrieved successfully`,
      wallet: {
        customer_id: parseInt(customer_id),
        current_balance: parseFloat(currentBalance),
        transactions: transactionsResult.rows,
      },
    });
  } catch (err) {
    console.error('Error fetching wallet details:', err.message);
    res.status(500).json({
      error: 'Failed to fetch wallet details',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  } finally {
    client.release();
  }
});


app.post('/api/check-cashback', async (req, res) => {
    const { customer_id } = req.body;

    // 1. Validate the customer ID
    if (!customer_id || isNaN(parseInt(customer_id))) {
        return res.status(400).json({ error: 'A valid customer_id is required in the request body.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 2. Fetch customer data. Use FOR UPDATE to lock the row and prevent race conditions.
        const customerResult = await client.query(
            `SELECT customer_id, bookings_completed, wallet_id FROM customers WHERE customer_id = $1 FOR UPDATE`,
            [customer_id]
        );

        const customer = customerResult.rows[0];

        // 3. Check if the customer exists
        if (!customer) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: `Customer with ID ${customer_id} not found.` });
        }
        
        // 4. CHECK IF THE CASHBACK CONDITION IS MET.
        // The condition is that bookings_completed is exactly 2.
        if (customer.bookings_completed !== 2) {
            await client.query('COMMIT');
            return res.status(200).json({
                message: `Bookings completed is not 2. No cashback awarded.`,
                customer_data: customer,
            });
        }
        
        // 5. ATOMICITY FIX: Check one more time inside the transaction block to ensure no other request has already added cashback.
        // This is the key change that prevents duplicate entries.
        const existingCashbackResult = await client.query(
            `SELECT id FROM wallet_transactions WHERE customer_id = $1 AND type = 'cashback' AND status = 'Received' LIMIT 1`,
            [customer_id]
        );
        const cashbackAlreadyAwarded = existingCashbackResult.rows.length > 0;
        
        if (cashbackAlreadyAwarded) {
            await client.query('COMMIT');
            return res.status(200).json({
                message: 'Cashback has already been awarded to this customer.',
                customer_data: customer,
            });
        }
        
        // If we reach this point, the conditions are met and no cashback has been awarded.
        const cashbackAmount = 15;
        console.log(`Customer ${customer_id} is eligible for a ₹${cashbackAmount} cashback.`);

        try {
            // 6. Fetch the customer's last wallet balance to calculate the new balance.
            const balanceResult = await client.query(
                `SELECT balance FROM wallet_transactions WHERE customer_id = $1 ORDER BY id DESC LIMIT 1`,
                [customer_id]
            );
            
            const lastBalance = balanceResult.rows[0] ? parseFloat(balanceResult.rows[0].balance) : 0;
            const newBalance = lastBalance + cashbackAmount;

            // 7. Insert the 'Received' cashback transaction into the wallet_transactions table.
            await client.query(
                `INSERT INTO wallet_transactions (customer_id, wallet_id, booking_id, amount, type, status, balance, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [customer.customer_id, customer.wallet_id, null, cashbackAmount, 'cashback', 'Received', newBalance, new Date()]
            );
            
            await client.query('COMMIT');

            console.log(`Cashback of ₹${cashbackAmount} successfully awarded and added to wallet for customer ${customer_id}.`);
            
            return res.status(200).json({
                message: 'Cashback has been awarded successfully and is now available in the customer\'s e-wallet.',
                customer_data: customer,
                showCashbackPopup: true,
            });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error during cashback award process:', error);
            return res.status(500).json({ 
                error: 'Failed to process cashback award.', 
                details: error.message 
            });
        }
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Database query error:', err.message);
        res.status(500).json({
            error: 'Failed to process cashback due to a database error.',
            details: err.message
        });
    } finally {
        client.release();
    }
});


// --- API Route for Withdrawal ---
// This route is called when the user explicitly requests to withdraw their cashback.
// This is the backend code that your React app calls.
// app.post('/api/withdraw-cashback', ...) is a new route for submitting a withdrawal request.
app.post('/api/withdraw-cashback', async (req, res) => {
    // We now expect the withdrawal amount to be sent in the request body, not hard-coded.
    const { customer_id, upi_id, withdrawalAmount } = req.body;
    
    const client = await pool.connect();

    // 1. Validate the incoming request data, including the new withdrawalAmount.
    if (!customer_id || isNaN(parseInt(customer_id)) || !upi_id || !withdrawalAmount || isNaN(parseFloat(withdrawalAmount))) {
        return res.status(400).json({ error: 'A valid customer_id, upi_id, and withdrawalAmount are required.' });
    }

    try {
        await client.query('BEGIN');

        // 2. Fetch the customer's data and their current wallet balance by summing all transaction balances.
        const customerResult = await client.query(
            `SELECT customer_id, wallet_id FROM customers WHERE customer_id = $1`,
            [customer_id]
        );

        // Calculate the actual current balance by summing the `balance` of all transactions.
        const balanceResult = await client.query(
            `SELECT SUM(balance) AS total_balance FROM wallet_transactions WHERE customer_id = $1`,
            [customer_id]
        );

        const customer = customerResult.rows[0];
        // Ensure a valid balance is fetched; default to 0 if no transactions exist.
        const currentBalance = balanceResult.rows[0].total_balance ? parseFloat(balanceResult.rows[0].total_balance) : 0;

        // Check if the customer exists.
        if (!customer) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Customer not found.' });
        }

        // 3. Check if the customer has enough balance to make a withdrawal request.
        if (currentBalance < withdrawalAmount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Insufficient balance for withdrawal. Current balance: ₹${currentBalance}.` });
        }
        
        // 4. Insert a new row for the withdrawal request.
        // The type is 'withdrawal' and the status is 'Requested'.
        // The balance field for this new transaction is the current total balance
        // before the withdrawal is processed.
        await client.query(
            `INSERT INTO wallet_transactions (customer_id, wallet_id, booking_id, amount, type, status, balance, upi_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [customer_id, customer.wallet_id, null, withdrawalAmount, 'withdrawal', 'Requested', currentBalance, upi_id]
        );

        await client.query('COMMIT');
        
        // 5. Send a success response.
        return res.status(200).json({
            message: 'Cashback withdrawal request has been submitted successfully.',
            withdrawal_amount: withdrawalAmount,
            current_balance: currentBalance,
            status: 'Requested'
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Database error message:', err.message);
        res.status(500).json({
            error: 'Failed to process withdrawal due to a database error.',
            details: err.message
        });
    } finally {
        // Ensure the database client is always released.
        client.release();
    }
});


// --- NEW ADMIN ROUTES ---

/**
 * @route GET /admin/wallet-transactions
 * @desc Admin route to fetch all wallet transactions across all customers.
 * @access Admin only (you should implement authentication/authorization)
 */
// This is the backend code that your React app calls.
// app.post('/api/withdraw-cashback', ...) is a new route for submitting a withdrawal request.
app.post('/api/withdraw-cashback', async (req, res) => {
    // We now expect the withdrawal amount to be sent in the request body, not hard-coded.
    const { customer_id, upi_id, withdrawalAmount } = req.body;
    
    const client = await pool.connect();

    // 1. Validate the incoming request data, including the new withdrawalAmount.
    if (!customer_id || isNaN(parseInt(customer_id)) || !upi_id || !withdrawalAmount || isNaN(parseFloat(withdrawalAmount))) {
        return res.status(400).json({ error: 'A valid customer_id, upi_id, and withdrawalAmount are required.' });
    }

    try {
        await client.query('BEGIN');

        // 2. Fetch the customer's data and their current wallet balance by summing all transaction balances.
        const customerResult = await client.query(
            `SELECT customer_id, wallet_id FROM customers WHERE customer_id = $1`,
            [customer_id]
        );

        // Calculate the actual current balance by summing the `balance` of all transactions.
        const balanceResult = await client.query(
            `SELECT SUM(balance) AS total_balance FROM wallet_transactions WHERE customer_id = $1`,
            [customer_id]
        );

        const customer = customerResult.rows[0];
        // Ensure a valid balance is fetched; default to 0 if no transactions exist.
        const currentBalance = balanceResult.rows[0].total_balance ? parseFloat(balanceResult.rows[0].total_balance) : 0;

        // Check if the customer exists.
        if (!customer) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Customer not found.' });
        }

        // 3. Check if the customer has enough balance to make a withdrawal request.
        if (currentBalance < withdrawalAmount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Insufficient balance for withdrawal. Current balance: ₹${currentBalance}.` });
        }
        
        // 4. Insert a new row for the withdrawal request.
        // The type is 'withdrawal' and the status is 'Requested'.
        // The balance field for this new transaction is the negative of the withdrawal amount.
        const transactionBalance = -withdrawalAmount;
        await client.query(
            `INSERT INTO wallet_transactions (customer_id, wallet_id, booking_id, amount, type, status, balance, upi_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            // Use parseInt() to convert the float values to integers before inserting into the database.
            [customer_id, customer.wallet_id, null, parseInt(withdrawalAmount), 'withdrawal', 'Requested', parseInt(transactionBalance), upi_id]
        );

        await client.query('COMMIT');
        
        // 5. Send a success response.
        // We will now return 0 as the current_balance to the user, as requested.
        return res.status(200).json({
            message: 'Cashback withdrawal request has been submitted successfully.',
            withdrawal_amount: withdrawalAmount,
            current_balance: 0, // This is the change to reflect the user's request
            status: 'Requested'
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Database error message:', err.message);
        res.status(500).json({
            error: 'Failed to process withdrawal due to a database error.',
            details: err.message
        });
    } finally {
        // Ensure the database client is always released.
        client.release();
    }
});


// --- ADMIN ROUTES (No changes needed here) ---

/**
 * @route GET /admin/wallet-transactions
 * @desc Admin route to fetch all wallet transactions across all customers.
 * @access Admin only (you should implement authentication/authorization)
 */
app.get('/admin/wallet-transactions', async (req, res) => {
  try {
    const query = `
      SELECT
        wt.id,
        wt.customer_id,
        wt.amount,
        wt.type,
        wt.status,
        wt.upi_id,
        wt.created_at,
        c.customer_name AS customer_name,
        c.customer_ph_number AS customer_ph_number
      FROM wallet_transactions wt
      JOIN customers c ON wt.customer_id = c.customer_id
      ORDER BY wt.created_at DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching all wallet transactions:', err);
    res.status(500).json({ error: 'Failed to fetch transactions.' });
  }
});

/**
 * @route GET /admin/pay-withdrawal/:transactionId
 * @desc Admin route to fetch UPI payment details for a 'Requested' withdrawal.
 * This route is called when the admin clicks 'PAY'. It does NOT update the DB.
 * @access Admin only (you should implement authentication/authorization)
 */
app.get('/admin/pay-withdrawal/:transactionId', async (req, res) => {
  const { transactionId } = req.params;

  try {
    // 1. Fetch the transaction to verify its status and get customer/amount details.
    const transactionResult = await pool.query(
      `SELECT customer_id, amount, upi_id FROM wallet_transactions WHERE id = $1 AND status = 'Requested';`,
      [transactionId]
    );

    if (transactionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found or not in a "Requested" state.' });
    }

    const { customer_id, amount, upi_id } = transactionResult.rows[0];

    // 2. Generate and return a UPI payment link for the admin to use.
    const upiLink = `upi://pay?pa=${upi_id}&pn=Cashback%20Withdrawal&am=${amount.toFixed(2)}&cu=INR`;

    res.status(200).json({
      message: 'UPI link generated successfully.',
      upiLink,
      customerId: customer_id,
      amount,
    });
  } catch (err) {
    console.error('Error fetching withdrawal details:', err);
    res.status(500).json({ error: 'An error occurred while fetching withdrawal details.' });
  }
});


/**
 * @route PUT /admin/confirm-withdrawal/:transactionId
 * @desc Admin route to confirm a payment and mark a transaction as 'Withdrawn'.
 * This is called when the admin clicks 'SAVE' after completing the payment.
 * @access Admin only (you should implement authentication/authorization)
 */
app.put('/admin/confirm-withdrawal/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // Start a database transaction

        // 1. Fetch the transaction to verify its status and get customer details for the notification
        const transactionQuery = `
            SELECT customer_id, amount, status
            FROM wallet_transactions
            WHERE id = $1;
        `;
        const transactionResult = await client.query(transactionQuery, [transactionId]);

        if (transactionResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Transaction not found.' });
        }

        const transaction = transactionResult.rows[0];

        // 2. Check if the transaction is still in a 'Requested' state
        if (transaction.status !== 'Requested') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Transaction has already been processed.' });
        }

        // 3. Update the existing transaction row as requested
        // Set the balance to the negative of the amount for this withdrawal transaction.
        const updateTransactionQuery = `
            UPDATE wallet_transactions
            SET status = 'Withdrawn', balance = -$2, type = 'withdrawal'
            WHERE id = $1;
        `;
        await client.query(updateTransactionQuery, [transactionId, transaction.amount]);

        await client.query('COMMIT'); // Commit the transaction if all queries succeed
        
        // 4. Send push notification to the customer
        try {
            // Recalculate the customer's balance after the withdrawal has been confirmed.
            const balanceQuery = `
                SELECT SUM(balance) AS total_balance FROM wallet_transactions WHERE customer_id = $1;
            `;
            const balanceResult = await pool.query(balanceQuery, [transaction.customer_id]);
            const newBalance = balanceResult.rows[0].total_balance ? parseFloat(balanceResult.rows[0].total_balance) : 0;
            
            const payload = {
                title: 'Withdrawal Confirmed!',
                body: `Cashback of ₹${parseFloat(transaction.amount).toFixed(2)} has been successfully withdrawn. Your new balance is ₹${newBalance.toFixed(2)}.`,
            };
            await sendNotificationToCustomer(transaction.customer_id, payload);
        } catch (notificationError) {
            console.error('Error sending push notification:', notificationError);
            // We log the error but do not roll back the transaction.
        }

        // 5. Respond to the client with a success message
        res.status(200).json({
            message: 'Withdrawal successfully confirmed and customer wallet updated.',
        });

    } catch (err) {
        await client.query('ROLLBACK'); // Roll back on any error
        console.error('Error confirming withdrawal:', err);
        res.status(500).json({ error: 'An error occurred while confirming the withdrawal.' });
    } finally {
        client.release();
    }
});





app.post('/bookings', async (req, res) => {
    // MODIFIED: Added booking_fee_paid to the request body
    const { shop_id, emp_id, customer_id, service_ids, booking_fee_paid } = req.body;

    // --- (UNCHANGED VALIDATION & INITIAL SETUP) ---
    if (!shop_id || !emp_id || !Array.isArray(service_ids) || service_ids.length === 0) {
        return res.status(400).json({
            error: 'Missing required fields: shop_id, emp_id, service_ids[]'
        });
    }
    if (!Number.isInteger(shop_id) || shop_id <= 0) {
        return res.status(400).json({ error: 'shop_id must be a positive integer' });
    }
    if (!Number.isInteger(emp_id) || emp_id <= 0) {
        return res.status(400).json({ error: 'emp_id must be a positive integer' });
    }
    if (!Number.isInteger(customer_id) || customer_id < 0) {
        return res.status(400).json({ error: 'customer_id must be a non-negative integer (0 allowed for no specific customer)' });
    }
    // MODIFIED: Added validation for the booking fee payment status
    if (customer_id > 0 && typeof booking_fee_paid !== 'boolean') {
        return res.status(400).json({ error: 'booking_fee_paid must be a boolean for registered customers' });
    }
    const invalidServiceIds = service_ids.filter(id => !Number.isInteger(id) || id <= 0);
    if (invalidServiceIds.length > 0) {
        return res.status(400).json({ error: 'All service_ids must be positive integers' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await updateBookingStatuses(client);

        const currentTime = dayjs().utc().toDate();

        const shopCheck = await client.query('SELECT shop_id, shop_name FROM shops WHERE shop_id = $1 AND is_active = TRUE', [shop_id]);
        if (shopCheck.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Shop not found or inactive' });
        }
        const empCheck = await client.query('SELECT emp_id, emp_name FROM employees WHERE emp_id = $1 AND shop_id = $2 AND is_active = TRUE', [emp_id, shop_id]);
        if (empCheck.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Employee not found, inactive, or does not belong to this shop' });
        }

        let customerName = 'Walk-in Customer';
        if (customer_id > 0) {
            const customerCheck = await client.query('SELECT customer_id, customer_name FROM customers WHERE customer_id = $1', [customer_id]);
            if (customerCheck.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Customer not found' });
            }
            customerName = customerCheck.rows[0].customer_name;
        }

        if (customer_id > 0) {
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

        let actualJoinTime;
        let foundSlot = false;
        const bookingDurationMs = totalDuration * 60000;
        const bufferTimeMs = 5 * 60000;

        const activeBookings = await client.query(`
            SELECT booking_id, join_time, end_time, service_duration_minutes, status
            FROM bookings
            WHERE emp_id = $1 AND status IN ('booked', 'in_service')
            ORDER BY join_time ASC;
        `, [emp_id]);

        let potentialSlotStart = new Date(currentTime.getTime() + bufferTimeMs);
        if (activeBookings.rows.length > 0 && activeBookings.rows[0].status === 'in_service') {
            potentialSlotStart = new Date(Math.max(potentialSlotStart.getTime(), dayjs.utc(activeBookings.rows[0].end_time).toDate().getTime() + bufferTimeMs));
        }

        for (let i = 0; i < activeBookings.rows.length; i++) {
            const currentBooking = activeBookings.rows[i];
            const currentBookingStartTime = dayjs.utc(currentBooking.join_time).toDate();
            const currentBookingEndTime = dayjs.utc(currentBooking.end_time).toDate();

            if (potentialSlotStart.getTime() + bookingDurationMs <= currentBookingStartTime.getTime()) {
                actualJoinTime = potentialSlotStart;
                foundSlot = true;
                break;
            }

            potentialSlotStart = new Date(currentBookingEndTime.getTime() + bufferTimeMs);
        }

        if (!foundSlot) {
            actualJoinTime = potentialSlotStart;
        }

        const endTime = new Date(actualJoinTime.getTime() + bookingDurationMs);
        const service_type = services.map(s => ({
            id: s.service_id,
            name: s.service_name,
            duration_minutes: s.service_duration_minutes
        }));
        let initialStatus = 'booked';
        if (actualJoinTime <= currentTime) {
            initialStatus = 'in_service';
        }

        const actualJoinTimeUTC = dayjs(actualJoinTime).utc().toDate();
        const endTimeUTC = dayjs(endTime).utc().toDate();

        const insertBookingQuery = `
            INSERT INTO bookings (
                shop_id, emp_id, customer_id,
                service_type, join_time, service_duration_minutes, end_time, status
            )
            VALUES ($1, $2, $3, $4::json, $5, $6, $7, $8)
            RETURNING *
        `;
        const bookingValues = [
            shop_id,
            emp_id,
            customer_id,
            JSON.stringify(service_type),
            actualJoinTimeUTC,
            totalDuration,
            endTimeUTC,
            initialStatus
        ];
        const { rows: bookingRows } = await client.query(insertBookingQuery, bookingValues);
        const newBooking = bookingRows[0];
        
        // --- MODIFIED: ADDED WALLET TRANSACTION LOGIC ---
        // Only create a wallet transaction if a customer_id is provided
        if (customer_id > 0) {
            const bookingFee = 3; // The fixed booking fee amount
            const walletTransactionQuery = `
                INSERT INTO wallet_transactions (
                    customer_id, wallet_id, booking_id, amount, type, balance, status
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `;
            const walletStatus = booking_fee_paid ? 'Paid' : 'Skipped';
            const walletValues = [
                customer_id,
                customer_id, // wallet_id is the same as customer_id
                newBooking.booking_id,
                bookingFee,
                'bookingfees',
                0, // Balance is 0 for booking fee transactions as per your example
                walletStatus
            ];
            await client.query(walletTransactionQuery, walletValues);
        }
        // --- END OF WALLET TRANSACTION LOGIC ---

        await client.query('COMMIT');
        const queuePosition = await client.query(`
            SELECT COUNT(*) + 1 as position
            FROM bookings
            WHERE emp_id = $1
            AND status = 'booked'
            AND join_time < $2
        `, [emp_id, actualJoinTimeUTC]);

        if (customer_id > 0) {
            await sendNotificationToCustomer(customer_id, {
                title: 'Booking Confirmed!',
                body: `Your booking (ID: ${newBooking.booking_id}) at ${shopCheck.rows[0].shop_name} with ${empCheck.rows[0].emp_name} is confirmed for ${dayjs(actualJoinTime).tz('Asia/Kolkata').format('hh:mm A')}.`,
                url: `/userdashboard`,
                bookingId: newBooking.booking_id,
                type: 'new_booking_customer',
            });
        }
        
        await sendNotificationToShop(shop_id, {
            title: 'New Booking Received!',
            body: `A new booking (ID: ${newBooking.booking_id}) has been made with ${empCheck.rows[0].emp_name} for ${customerName} at ${dayjs(actualJoinTime).tz('Asia/Kolkata').format('hh:mm A')}.`,
            url: `/shopdashboard`,
            bookingId: newBooking.booking_id,
            type: 'new_booking_shop',
        });

        res.status(201).json({
            message: 'Booking created successfully',
            booking: {
                ...newBooking,
                shop_name: shopCheck.rows[0].shop_name,
                emp_name: empCheck.rows[0].emp_name,
                customer_name: customerName,
                services: services,
                total_duration_minutes: totalDuration,
                queue_position: initialStatus === 'booked' ? queuePosition.rows[0].position : null,
                formatted_times: {
                    join_time: dayjs(actualJoinTime).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss'),
                    end_time: dayjs(endTime).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss'),
                    join_time_display: dayjs(actualJoinTime).tz('Asia/Kolkata').format('MMM DD, YYYY - hh:mm A'),
                    end_time_display: dayjs(endTime).tz('Asia/Kolkata').format('MMM DD, YYYY - hh:mm A')
                },
                estimated_wait_time: initialStatus === 'booked' ?
                    Math.max(0, Math.ceil((actualJoinTime.getTime() - currentTime.getTime()) / (1000 * 60))) + ' minutes' :
                    'Service starting now',
                automatic_status_info: {
                    will_start_at: dayjs(actualJoinTime).tz('Asia/Kolkata').format('MMM DD, YYYY - hh:mm A'),
                    will_complete_at: dayjs(endTime).tz('Asia/Kolkata').format('MMM DD, YYYY - hh:mm A'),
                    status_changes: {
                        to_in_service: actualJoinTime <= currentTime ? 'Already started' : 'When join_time is reached',
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
// Assuming 'pool' is your PostgreSQL connection pool and 'dayjs' is imported

// Assuming 'pool' is your PostgreSQL connection pool and 'dayjs' is imported

// Assuming 'pool' is your PostgreSQL connection pool and 'dayjs' is imported

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
            // Pass the UTC end_time for calculation
            await updateSubsequentBookings(client, emp_id, dayjs.utc(end_time).toDate(), service_duration_minutes, shop_id); // Parse as UTC
        }

        // Notify Shop about customer cancellation
        if (shop_id && emp_id) {
            const empNameResult = await client.query(`SELECT emp_name FROM employees WHERE emp_id = $1`, [emp_id]);
            const empName = empNameResult.rows[0]?.emp_name || 'an employee';
            const customerNameResult = await client.query(`SELECT customer_name FROM customers WHERE customer_id = $1`, [customer_id]);
            const customerName = customerNameResult.rows[0]?.customer_name || 'A customer';

            await sendNotificationToShop(shop_id, {
                title: 'Booking Cancelled by Customer!',
                body: `Booking (ID: ${booking_id}) with ${empName} for ${customerName} at ${dayjs.utc(join_time).tz('Asia/Kolkata').format('hh:mm A')} has been cancelled by the customer.`, // Formatted in IST
                url: `/shopdashboard`,
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
                original_join_time: dayjs.utc(join_time).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss'), // Formatted in IST
                original_end_time: dayjs.utc(end_time).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss') // Formatted in IST
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
            // Pass the UTC end_time for calculation
            await updateSubsequentBookings(client, emp_id, dayjs.utc(end_time).toDate(), service_duration_minutes, shop_id); // Parse as UTC
        }

        // 5. Send Notification to Customer about Cancellation
        if (customer_id) {
            const notificationPayload = {
                title: 'Booking Cancelled!',
                body: `Your booking (ID: ${booking_id}) on ${dayjs.utc(join_time).tz('Asia/Kolkata').format('YYYY-MM-DD')} at ${dayjs.utc(join_time).tz('Asia/Kolkata').format('hh:mm A')} has been cancelled by the shop.`, // Formatted in IST
                url: `/userdashboard`, // Link to customer's dashboard or specific booking
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
                body: `You have successfully cancelled booking (ID: ${booking_id}) for ${dayjs.utc(join_time).tz('Asia/Kolkata').format('hh:mm A')}.`, // Formatted in IST
                url: `/shopdashboard`,
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
                original_join_time: dayjs.utc(join_time).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss'), // Formatted in IST
                original_end_time: dayjs.utc(end_time).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss') // Formatted in IST
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

async function updateSubsequentBookings(client, empId, cancelledBookingOriginalEndTimeUTC, cancelledServiceDurationMinutes, shopId) {
    // The cancelledBookingOriginalEndTimeUTC is already a Date object representing UTC.
    const subsequentBookingsQuery = `
        SELECT booking_id, customer_id, join_time, end_time, service_duration_minutes, status
        FROM bookings
        WHERE emp_id = $1
        AND status IN ('booked', 'in_service')
        AND join_time >= $2
        ORDER BY join_time ASC;
    `;
    const { rows: subsequentBookings } = await client.query(subsequentBookingsQuery, [empId, cancelledBookingOriginalEndTimeUTC]);

    if (subsequentBookings.length === 0) {
        return;
    }

    const currentTime = dayjs().utc().toDate(); // Get current time in UTC

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
    `, [empId, cancelledBookingOriginalEndTimeUTC]);

    if (precedingBookingQuery.rowCount > 0) {
        // Treat fetched end_time as UTC for calculation
        effectivePreviousEndTime = dayjs.utc(precedingBookingQuery.rows[0].end_time).toDate().getTime(); // Parse as UTC
    } else {
        effectivePreviousEndTime = currentTime.getTime();
    }

    let currentCalculatedTime = new Date(effectivePreviousEndTime + 5 * 60000);
    currentCalculatedTime = new Date(Math.max(currentCalculatedTime.getTime(), currentTime.getTime() + 5 * 60000));

    for (const booking of subsequentBookings) {
        // Treat fetched join_time and end_time as UTC for calculation
        const originalJoinTime = dayjs.utc(booking.join_time).toDate(); // Parse as UTC
        const originalEndTime = dayjs.utc(booking.end_time).toDate(); // Parse as UTC
        const customerId = booking.customer_id;

        const originalEstimatedWaitTime = Math.max(0, Math.ceil((originalJoinTime.getTime() - currentTime.getTime()) / (1000 * 60)));

        let newJoinTime;
        let newEndTime;

        newJoinTime = new Date(Math.max(originalJoinTime.getTime() - timeToShift, currentCalculatedTime.getTime()));
        newEndTime = new Date(newJoinTime.getTime() + booking.service_duration_minutes * 60000);

        const newEstimatedWaitTime = Math.max(0, Math.ceil((newJoinTime.getTime() - currentTime.getTime()) / (1000 * 60)));

        if (newJoinTime.getTime() !== originalJoinTime.getTime() || newEndTime.getTime() !== originalEndTime.getTime()) {
            // Convert newJoinTime and newEndTime to UTC Date objects for insertion
            const newJoinTimeUTC = dayjs(newJoinTime).utc().toDate();
            const newEndTimeUTC = dayjs(newEndTime).utc().toDate();

            await client.query(
                `UPDATE bookings
                 SET join_time = $1, end_time = $2
                 WHERE booking_id = $3`,
                [newJoinTimeUTC, newEndTimeUTC, booking.booking_id] // Use UTC Date objects for update
            );
            console.log(`Updated booking ${booking.booking_id}: Old join_time: ${dayjs.utc(originalJoinTime).tz('Asia/Kolkata').format('HH:mm')}, New join_time ${dayjs.utc(newJoinTime).tz('Asia/Kolkata').format('HH:mm')}`); // Log in IST

            // Notify Customer about time shift
            if (customerId) {
                let notificationPayload = null;
                const timeDifference = originalEstimatedWaitTime - newEstimatedWaitTime;

                if (timeDifference >= 5) { // Notify if shifted by 5 minutes or more
                    notificationPayload = {
                        title: 'Booking Time Shifted!',
                        body: `Your booking (ID: ${booking.booking_id}) is now scheduled ${timeDifference} minutes earlier. New start time: ${dayjs.utc(newJoinTime).tz('Asia/Kolkata').format('hh:mm A')}.`, // Formatted in IST
                        url: `/userdashboard`,
                        bookingId: booking.booking_id,
                        type: 'time_shift',
                    };
                }

                if (originalEstimatedWaitTime > 10 && newEstimatedWaitTime <= 10) { // Notify if wait time becomes critical
                    notificationPayload = {
                        title: 'Get Ready Soon!',
                        body: `Your estimated wait time for booking (ID: ${booking.booking_id}) is now less than 10 minutes.`,
                        url: `/userdashboard`,
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
                    body: `Booking (ID: ${booking.booking_id}) for ${customerName} with ${empName} has been shifted. New start time: ${dayjs.utc(newJoinTime).tz('Asia/Kolkata').format('hh:mm A')}.`, // Formatted in IST
                    url: `/shopdashboard`,
                    bookingId: booking.booking_id,
                    type: 'shop_queue_update',
                });
            }
        }
        currentCalculatedTime = new Date(newEndTime.getTime() + 5 * 60000);
    }
}
// --- Route to get bookings for a specific customer with filters and pagination ---
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

    try {
        // Define currentTime at the beginning of the route handler for consistent time calculations
        const currentTime = dayjs().utc().toDate(); // Get current time in UTC

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
            const dateObj = dayjs(date).utc().toDate(); // Ensure date is treated as UTC for comparison
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
        const result = await pool.query(query, queryParams);

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
            const dateObj = dayjs(date).utc().toDate(); // Ensure date is treated as UTC for comparison
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
        const countResult = await pool.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0].total);

        // Process and format each booking's data for the response
        const bookings = result.rows.map(booking => {
            let timeInfo = {}; // Object to hold time-related display information
            
            // Treat fetched times as UTC and convert to IST for display
            const joinTime = dayjs.utc(booking.join_time).tz('Asia/Kolkata');
            const endTime = dayjs.utc(booking.end_time).tz('Asia/Kolkata');

            // Populate timeInfo based on the booking status
            if (booking.status === 'booked') {
                const timeUntilStart = Math.max(0, Math.ceil((joinTime.toDate().getTime() - dayjs().tz('Asia/Kolkata').toDate().getTime()) / (1000 * 60)));
                timeInfo = {
                    time_until_service: timeUntilStart + ' minutes',
                    estimated_start: joinTime.format('hh:mm A')
                };
            } else if (booking.status === 'in_service') {
                const timeUntilEnd = Math.max(0, Math.ceil((endTime.toDate().getTime() - dayjs().tz('Asia/Kolkata').toDate().getTime()) / (1000 * 60)));
                timeInfo = {
                    time_remaining: timeUntilEnd + ' minutes',
                    estimated_completion: endTime.format('hh:mm A')
                };
            } else if (booking.status === 'completed') {
                timeInfo = {
                    completed_at: endTime.format('MMM DD, YYYY - hh:mm A'),
                    duration_was: booking.service_duration_minutes + ' minutes'
                };
            }

            return {
                ...booking, // Include all original booking fields
                formatted_times: {
                    join_time: joinTime.format('YYYY-MM-DD HH:mm:ss'),
                    end_time: endTime.format('YYYY-MM-DD HH:mm:ss'),
                    join_time_display: joinTime.format('MMM DD, YYYY - hh:mm A'),
                    end_time_display: endTime.format('MMM DD, YYYY - hh:mm A')
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
            statusSummaryParams.push(dayjs(date).utc().toDate()); // Ensure date is treated as UTC for comparison
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
        const statusSummary = await pool.query(statusSummaryQuery, statusSummaryParams);

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
                last_status_update: dayjs().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss [IST]') // Timestamp of when statuses were last updated/fetched
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

    try {
        // Define currentTime at the beginning of the route handler
        const currentTime = dayjs().utc().toDate(); // Get current time in UTC

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
            const dateObj = dayjs(date).utc().toDate(); // Ensure date is treated as UTC for comparison
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
        const result = await pool.query(query, queryParams);

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
            const dateObj = dayjs(date).utc().toDate(); // Ensure date is treated as UTC for comparison
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
            countParamIndex++;
        }

        const countResult = await pool.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0].total);

        // Process and format booking data
        const bookings = result.rows.map(booking => {
            // Calculate time information based on status
            let timeInfo = {};
            // Treat fetched times as UTC and convert to IST for display
            const joinTime = dayjs.utc(booking.join_time).tz('Asia/Kolkata');
            const endTime = dayjs.utc(booking.end_time).tz('Asia/Kolkata');

            if (booking.status === 'booked') {
                const timeUntilStart = Math.max(0, Math.ceil((joinTime.toDate().getTime() - dayjs().tz('Asia/Kolkata').toDate().getTime()) / (1000 * 60)));
                timeInfo = {
                    time_until_service: timeUntilStart + ' minutes',
                    estimated_start: joinTime.format('hh:mm A')
                };
            } else if (booking.status === 'in_service') {
                const timeUntilEnd = Math.max(0, Math.ceil((endTime.toDate().getTime() - dayjs().tz('Asia/Kolkata').toDate().getTime()) / (1000 * 60)));
                timeInfo = {
                    time_remaining: timeUntilEnd + ' minutes',
                    estimated_completion: endTime.format('hh:mm A')
                };
            } else if (booking.status === 'completed') {
                timeInfo = {
                    completed_at: endTime.format('MMM DD, YYYY - hh:mm A'),
                    duration_was: booking.service_duration_minutes + ' minutes'
                };
            }

            return {
                ...booking,
                formatted_times: {
                    join_time: joinTime.format('YYYY-MM-DD HH:mm:ss'),
                    end_time: endTime.format('YYYY-MM-DD HH:mm:ss'),
                    join_time_display: joinTime.format('MMM DD, YYYY - hh:mm A'),
                    end_time_display: endTime.format('MMM DD, YYYY - hh:mm A')
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
            statusSummaryParams.push(dayjs(date).utc().toDate()); // Ensure date is treated as UTC for comparison
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


        const statusSummary = await pool.query(statusSummaryQuery, statusSummaryParams);

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
                last_status_update: dayjs().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss [IST]') // Formatted in IST
            }
        });

    } catch (error) {
        console.error('Error fetching all bookings:', error);
        res.status(500).json({ 
            error: 'Server error while fetching bookings',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
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

    try {
        // Update the 'is_active' status for the specified shop_id
        const result = await pool.query(
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

    try {
        const result = await pool.query(
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
    }
});


app.get('/', (req, res) => {
    res.send('Backend for Trimtadka successfully running in Vercel');
});
// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
