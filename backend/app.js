
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
    // Destructure new fields: gender and type
    const { shop_name, lat, long, address, ph_number, password, gender, type } = req.body;

    // Basic validation for required fields, including new ones
    if (!shop_name || !ph_number || !password || !gender || !type) {
        return res.status(400).json({ message: 'Shop name, phone number, password, gender, and type are required.' });
    }
    
    try {
        // Hash the password for security
        const hashedPassword = await bcrypt.hash(password, 10);

        // Check if a shop with this phone number already exists
        const checkExisting = await pool.query(
            'SELECT shop_id FROM shops WHERE ph_number = $1',
            [ph_number]
        );

        if (checkExisting.rows.length > 0) {
            return res.status(409).json({ message: 'Shop with this phone number already exists.' });
        }

        // Insert new shop into the database, including the new gender and type fields
        const result = await pool.query(
            'INSERT INTO shops (shop_name, lat, long, address, ph_number, password, is_active, gender, type) VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8) RETURNING shop_id, shop_name, ph_number, is_active, gender, type',
            [shop_name, lat, long, address, ph_number, hashedPassword, gender, type]
        );

        const newShop = result.rows[0];

        // Generate a JWT token for the newly signed-up shop
        const token = jwt.sign(
            { id: newShop.shop_id, role: 'shop', phone: newShop.ph_number },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Respond with success message, new shop details, and the JWT token
        res.status(201).json({
            message: 'Shop signed up successfully!',
            shop: {
                id: newShop.shop_id,
                name: newShop.shop_name,
                phone: newShop.ph_number,
                is_active: newShop.is_active,
                gender: newShop.gender,
                type: newShop.type
            },
            token
        });

    } catch (error) {
        console.error('Error during shop sign-up:', error);
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
        const shopsQuery = `
            SELECT
                s.shop_id,
                s.shop_name,
                s.lat,
                s.long,
                s.address,
                s.ph_number,
                s.is_active AS shop_is_active,
                s.image_url,
                s.is_subscribed,        -- Added
                s.ads,                  -- Added
                s.banners,              -- Added
                s.offers,               -- Added
                s.top_rated,            -- Added
                s.wallet_id,            -- Added
                s.type,                 -- Added
                s.bookings_completed,   -- Added
                s.credits,              -- Added
                s.gender,               -- Added
                s.monthly_bookings_count, -- Added
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
            GROUP BY s.shop_id, s.shop_name, s.lat, s.long, s.address, s.ph_number, s.is_active, s.image_url,
                     s.is_subscribed, s.ads, s.banners, s.offers, s.top_rated, s.wallet_id, s.type,
                     s.bookings_completed, s.credits, s.gender, s.monthly_bookings_count, -- Added to GROUP BY
                     e.emp_id, e.emp_name, e.is_active
            ORDER BY s.shop_name, e.emp_name
        `;

        const shopsResult = await pool.query(shopsQuery);

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

        const shopsMap = new Map();

        shopsResult.rows.forEach(row => {
            if (!shopsMap.has(row.shop_id)) {
                shopsMap.set(row.shop_id, {
                    shop_id: row.shop_id,
                    shop_name: row.shop_name,
                    ph_number: row.ph_number,
                    is_active: row.shop_is_active,
                    image_url: row.image_url,
                    is_subscribed: row.is_subscribed,        // Added
                    ads: row.ads,                            // Added
                    banners: row.banners,                    // Added
                    offers: row.offers,                      // Added
                    top_rated: row.top_rated,                // Added
                    wallet_id: row.wallet_id,                // Added
                    type: row.type,                          // Added
                    bookings_completed: row.bookings_completed, // Added
                    credits: row.credits,                    // Added
                    gender: row.gender,                      // Added
                    monthly_bookings_count: row.monthly_bookings_count, // Added
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


// --- POST /shop_status ---
// Fetches detailed status for a specific shop, including its barbers, queue info,
// and now all shop details like subscription, perks, etc.
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
                s.image_url,
                s.is_subscribed,        -- Added
                s.ads,                  -- Added
                s.banners,              -- Added
                s.offers,               -- Added
                s.top_rated,            -- Added
                s.wallet_id,            -- Added
                s.type,                 -- Added
                s.bookings_completed,   -- Added
                s.credits,              -- Added
                s.gender,               -- Added
                s.monthly_bookings_count, -- Added
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
            GROUP BY s.shop_id, s.shop_name, s.lat, s.long, s.address, s.ph_number, s.is_active, s.image_url,
                     s.is_subscribed, s.ads, s.banners, s.offers, s.top_rated, s.wallet_id, s.type,
                     s.bookings_completed, s.credits, s.gender, s.monthly_bookings_count, -- Added to GROUP BY
                     e.emp_id, e.emp_name, e.is_active
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
                    image_url: row.image_url,
                    is_subscribed: row.is_subscribed,        // Added
                    ads: row.ads,                            // Added
                    banners: row.banners,                    // Added
                    offers: row.offers,                      // Added
                    top_rated: row.top_rated,                // Added
                    wallet_id: row.wallet_id,                // Added
                    type: row.type,                          // Added
                    bookings_completed: row.bookings_completed, // Added
                    credits: row.credits,                    // Added
                    gender: row.gender,                      // Added
                    monthly_bookings_count: row.monthly_bookings_count, // Added
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

app.put('/customers/:customer_id/sync-completed-bookings', async (req, res) => {
  const { customer_id } = req.params;

  if (!customer_id || isNaN(parseInt(customer_id))) {
    return res.status(400).json({ error: 'VALID CUSTOMER_ID IS REQUIRED' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Count the number of completed bookings for the customer.
    const countResult = await client.query(
      `SELECT COUNT(*) FROM bookings WHERE customer_id = $1 AND status = 'completed'`,
      [customer_id]
    );
    const completedBookingsCount = parseInt(countResult.rows[0].count);

    // 2. Update the customer's record with the new count.
    const updateCustomerQuery = `
      UPDATE customers
      SET bookings_completed = $1
      WHERE customer_id = $2
      RETURNING *;
    `;
    const updateResult = await client.query(updateCustomerQuery, [completedBookingsCount, customer_id]);

    if (updateResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'CUSTOMER NOT FOUND' });
    }

    await client.query('COMMIT');

    res.status(200).json({
      message: `BOOKINGS COMPLETED COUNT FOR CUSTOMER ID ${customer_id} UPDATED TO ${completedBookingsCount}`,
      customer: updateResult.rows[0],
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('FAILED TO SYNC COMPLETED BOOKINGS COUNT:', err.message);
    res.status(500).json({
      error: 'FAILED TO SYNC COMPLETED BOOKINGS COUNT',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  } finally {
    client.release();
  }
});

app.post('/api/check-customer-cashback', async (req, res) => {
  const { customer_id } = req.body;

  console.log(`[DEBUG] Received request to check cashback for customer_id: ${customer_id}`);

  if (!customer_id || isNaN(parseInt(customer_id))) {
    console.error(`[ERROR] Invalid customer_id received: ${customer_id}`);
    return res.status(400).json({ error: 'A valid customer_id is required.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log(`[DEBUG] Database transaction started for customer_id: ${customer_id}`);

    const customerResult = await client.query(
      `SELECT customer_id, bookings_completed FROM customers WHERE customer_id = $1 FOR UPDATE`,
      [customer_id]
    );

    const customer = customerResult.rows[0];
    if (!customer) {
      await client.query('ROLLBACK');
      console.error(`[ERROR] Customer not found for customer_id: ${customer_id}`);
      return res.status(404).json({ error: `Customer with ID ${customer_id} not found.` });
    }
    console.log(`[DEBUG] Customer data fetched:`, customer);

    const cashbackRuleResult = await client.query(
      `SELECT id, amount, is_subscribed, limit_id FROM cashbacks WHERE type = 'customer' AND is_subscribed = true AND achievement <= $1 ORDER BY achievement DESC LIMIT 1`,
      [customer.bookings_completed]
    );
    const cashbackRule = cashbackRuleResult.rows[0];

    console.log(`[DEBUG] Found cashback rule for ${customer.bookings_completed} bookings:`, cashbackRule);

    if (!cashbackRule) {
      await client.query('COMMIT');
      console.log(`[INFO] No active cashback rule found. Committing transaction for customer: ${customer_id}`);
      return res.status(200).json({ message: `No active cashback rule found for ${customer.bookings_completed} completed bookings.` });
    }
    
    if (customer.customer_id > cashbackRule.limit_id) {
      await client.query('COMMIT');
      console.log(`[INFO] Customer ${customer_id} does not meet limit_id of ${cashbackRule.limit_id}. Committing.`);
      return res.status(200).json({
        message: `Cashback rule is limited to customer_ids less than or equal to ${cashbackRule.limit_id}.`
      });
    }

    const existingCashbackResult = await client.query(
      `SELECT id FROM wallet_transactions 
       WHERE customer_id = $1 AND type = 'cashback' AND status = 'Received' AND cashback_rule_id = $2
       LIMIT 1`,
      [customer_id, cashbackRule.id]
    );
    
    const cashbackAlreadyAwarded = existingCashbackResult.rows.length > 0;
    console.log(`[DEBUG] Cashback already awarded for rule ${cashbackRule.id}? ${cashbackAlreadyAwarded}`);

    if (cashbackAlreadyAwarded) {
      await client.query('COMMIT');
      console.log(`[INFO] Cashback already awarded for this rule. Committing transaction for customer: ${customer_id}`);
      return res.status(200).json({ message: 'Cashback has already been awarded for this specific achievement rule.' });
    }

    const cashbackAmount = cashbackRule.amount;
    // The balance is now simply the amount of the cashback transaction itself
    const transactionBalance = cashbackAmount; 

    console.log(`[INFO] Customer ${customer_id} is eligible for a cashback of: ${cashbackAmount}`);
    console.log(`[DEBUG] Transaction balance will be: ${transactionBalance}`);

    await client.query(
      `INSERT INTO wallet_transactions (customer_id, wallet_id, booking_id, cashback_rule_id, amount, type, status, balance, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [customer.customer_id, customer.customer_id, null, cashbackRule.id, cashbackAmount, 'cashback', 'Received', transactionBalance, new Date()]
    );

    await client.query('COMMIT');

    console.log(`[SUCCESS] Cashback of ${cashbackAmount} awarded to customer ${customer_id}. Transaction balance: ${transactionBalance}. Transaction committed.`);

    return res.status(200).json({
      message: 'Cashback has been awarded successfully and is now available in the customer\'s e-wallet.',
      showCashbackPopup: true,
      cashbackAmount: cashbackAmount,
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[FATAL ERROR] An unexpected error occurred for customer ${customer_id}. Transaction rolled back.`, error);
    return res.status(500).json({ error: 'Failed to process cashback award.', details: error.message });
  } finally {
    client.release();
    console.log(`[DEBUG] Database connection released for customer: ${customer_id}`);
  }
});

app.post('/api/check-shop-cashback', async (req, res) => {
  const { shop_id } = req.body;

  console.log(`[DEBUG] Received request to check cashback for shop_id: ${shop_id}`);

  if (!shop_id || isNaN(parseInt(shop_id))) {
    console.error(`[ERROR] Invalid shop_id received: ${shop_id}`);
    return res.status(400).json({ error: 'A valid shop_id is required.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log(`[DEBUG] Database transaction started for shop_id: ${shop_id}`);

    const shopResult = await client.query(
      `SELECT shop_id, monthly_bookings_count, is_subscribed FROM shops WHERE shop_id = $1 FOR UPDATE`,
      [shop_id]
    );

    const shop = shopResult.rows[0];
    if (!shop) {
      await client.query('ROLLBACK');
      console.error(`[ERROR] Shop not found for shop_id: ${shop_id}`);
      return res.status(404).json({ error: `Shop with ID ${shop_id} not found.` });
    }
    console.log(`[DEBUG] Shop data fetched:`, shop);

    if (!shop.is_subscribed) {
      await client.query('COMMIT');
      console.log(`[INFO] Shop ${shop_id} is not subscribed. No cashback awarded.`);
      return res.status(200).json({ message: 'Shop is not subscribed, so no cashback is applicable.' });
    }

    const cashbackRuleResult = await client.query(
      `SELECT id, amount, limit_id FROM cashbacks WHERE type = 'shop' AND achievement <= $1 ORDER BY achievement DESC LIMIT 1`,
      [shop.monthly_bookings_count]
    );
    const cashbackRule = cashbackRuleResult.rows[0];

    console.log(`[DEBUG] Found cashback rule for ${shop.monthly_bookings_count} monthly bookings:`, cashbackRule);

    if (!cashbackRule) {
      await client.query('COMMIT');
      console.log(`[INFO] No cashback rule found. Committing transaction.`);
      return res.status(200).json({ message: `No cashback rule found for ${shop.monthly_bookings_count} monthly bookings.` });
    }
    
    if (shop.shop_id > cashbackRule.limit_id) {
      await client.query('COMMIT');
      console.log(`[INFO] Shop ${shop_id} does not meet limit_id of ${cashbackRule.limit_id}. Committing.`);
      return res.status(200).json({
        message: `Cashback rule is limited to shop_ids less than or equal to ${cashbackRule.limit_id}.`
      });
    }

    const existingCashbackResult = await client.query(
      `SELECT id FROM wallet_transactions_shop 
       WHERE shop_id = $1 AND type = 'cashback' AND status = 'Received' AND cashback_rule_id = $2
       LIMIT 1`,
      [shop_id, cashbackRule.id]
    );
    
    const cashbackAlreadyAwarded = existingCashbackResult.rows.length > 0;
    console.log(`[DEBUG] Cashback already awarded for rule ${cashbackRule.id}? ${cashbackAlreadyAwarded}`);

    if (cashbackAlreadyAwarded) {
      await client.query('COMMIT');
      console.log(`[INFO] Cashback already awarded for this rule. Committing transaction for shop: ${shop_id}`);
      return res.status(200).json({ message: 'Cashback has already been awarded for this specific achievement rule.' });
    }

    const cashbackAmount = parseFloat(cashbackRule.amount);
    // The balance is now simply the amount of the cashback transaction itself
    const transactionBalance = cashbackAmount;

    console.log(`[INFO] Shop ${shop_id} is eligible for a cashback of: ${cashbackAmount}`);
    console.log(`[DEBUG] Transaction balance will be: ${transactionBalance}`);

    await client.query(
      `INSERT INTO wallet_transactions_shop (shop_id, wallet_id, booking_id, cashback_rule_id, amount, type, status, balance, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [shop.shop_id, shop.shop_id, null, cashbackRule.id, cashbackAmount, 'cashback', 'Received', transactionBalance, new Date()]
    );

    await client.query('COMMIT');

    console.log(`[SUCCESS] Cashback of ${cashbackAmount} awarded to shop ${shop_id}. Transaction balance: ${transactionBalance}. Transaction committed.`);

    return res.status(200).json({
      message: 'Cashback has been awarded successfully and is now available in the shop\'s e-wallet.',
      showCashbackPopup: true,
      cashbackAmount: cashbackAmount,
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[FATAL ERROR] An unexpected error occurred for shop ${shop_id}. Transaction rolled back.`, error);
    return res.status(500).json({ error: 'Failed to process cashback award.', details: error.message });
  } finally {
    client.release();
    console.log(`[DEBUG] Database connection released for shop: ${shop_id}`);
  }
});




// This route remains unchanged as it correctly updates the lifetime bookings_completed count.

// --- API Route for Withdrawal ---
// This route is called when the user explicitly requests to withdraw their cashback.
// This is the backend code that your React app calls.
// app.post('/api/withdraw-cashback', ...) is a new route for submitting a withdrawal request.

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
        const currentBalance =  balanceResult.rows[0].total_balance ? parseFloat(balanceResult.rows[0].total_balance) : 0;;

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
        const transactionBalance = 0;
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


// --- SHOP WALLET ROUTES (No changes needed here) ---

app.get('/shops/:shop_id/wallet', async (req, res) => {
    const shop_id = parseInt(req.params.shop_id);

    if (!Number.isInteger(shop_id) || shop_id <= 0) {
        return res.status(400).json({ error: 'Invalid shop_id.' });
    }

    const client = await pool.connect();
    try {
        // Verify shop existence
        const shopCheck = await client.query('SELECT shop_id FROM public.shops WHERE shop_id = $1', [shop_id]);
        if (shopCheck.rowCount === 0) {
            return res.status(404).json({ error: 'Shop not found.' });
        }

        // Fetch all transactions for the shop, ordered by creation time descending
        const transactionsResult = await client.query(
            `SELECT id, shop_id, booking_id, amount, type, balance, status, created_at, upi_id
             FROM public.wallet_transactions_shop
             WHERE shop_id = $1
             ORDER BY created_at DESC`,
            [shop_id]
        );

        const transactions = transactionsResult.rows;

        // Calculate the current balance by summing the 'balance' column of all transactions.
        const currentBalance = transactions.reduce((sum, tx) => sum + tx.balance, 0);

        res.status(200).json({
            shop_id: shop_id,
            current_balance: currentBalance,
            transactions: transactions,
        });

    } catch (error) {
        console.error(`Error fetching wallet for shop ${shop_id}:`, error.message);
        res.status(500).json({ error: 'Failed to fetch shop wallet data.' });
    } finally {
        client.release();
    }
});

// --- 2. POST /shops/:shop_id/withdraw ---
// Handles withdrawal requests from a shop's wallet.
app.post('/shops/:shop_id/withdraw', async (req, res) => {
    const shop_id = parseInt(req.params.shop_id);
    const { upi_id, withdrawalAmount } = req.body;

    if (!Number.isInteger(shop_id) || shop_id <= 0) {
        return res.status(400).json({ error: 'Invalid shop_id.' });
    }
    if (!upi_id || typeof upi_id !== 'string' || upi_id.trim() === '') {
        return res.status(400).json({ error: 'Valid UPI ID is required.' });
    }
    if (typeof withdrawalAmount !== 'number' || withdrawalAmount <= 0) {
        return res.status(400).json({ error: 'Withdrawal amount must be a positive number.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Verify shop existence and get its wallet_id
        const shopResult = await client.query(
            `SELECT shop_id, wallet_id FROM public.shops WHERE shop_id = $1`,
            [shop_id]
        );
        const shop = shopResult.rows[0];

        if (!shop) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Shop not found.' });
        }

        // 2. Calculate current wallet balance for the shop
        const balanceResult = await client.query(
            `SELECT SUM(balance) AS total_balance FROM public.wallet_transactions_shop WHERE shop_id = $1`,
            [shop_id]
        );
        const currentBalance = balanceResult.rows[0].total_balance ? parseFloat(balanceResult.rows[0].total_balance) : 0;

        // 3. Check if there are sufficient funds and no pending withdrawals
        if (currentBalance < withdrawalAmount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Insufficient funds for withdrawal.' });
        }

        const pendingWithdrawalCheck = await client.query(
            `SELECT COUNT(*) FROM public.wallet_transactions_shop WHERE shop_id = $1 AND status = 'Requested' AND type = 'withdrawal'`,
            [shop_id]
        );
        if (pendingWithdrawalCheck.rows[0].count > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'A withdrawal request is already pending. Please wait for it to be processed.' });
        }

        // 4. Insert a 'withdrawal' transaction with 'Requested' status
        const newBalance = currentBalance - withdrawalAmount;
        const withdrawalTransactionQuery = `
            INSERT INTO public.wallet_transactions_shop (
                shop_id, wallet_id, amount, type, balance, status, upi_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        const withdrawalValues = [
            shop_id,
            shop.wallet_id, // Use the shop's wallet_id
            withdrawalAmount,
            'withdrawal',
             0 , 
            'Requested',
            upi_id.trim()
        ];
        await client.query(withdrawalTransactionQuery, withdrawalValues);

        await client.query('COMMIT');
        res.status(200).json({
            message: 'Withdrawal request submitted successfully.',
            new_balance: newBalance,
            status: 'Requested'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error processing withdrawal for shop ${shop_id}:`, error.message);
        res.status(500).json({ error: 'Failed to process withdrawal: ' + error.message });
    } finally {
        client.release();
    }
});

//-Shops subscription payments


app.get('/shops/:shop_id', async (req, res) => {
    console.log(`[GET /shops/:shop_id] Request received for shop ID: ${req.params.shop_id}`);
    const shop_id = parseInt(req.params.shop_id);

    // Validate shop_id
    if (!Number.isInteger(shop_id) || shop_id <= 0) {
        console.error(`[GET /shops/:shop_id] Invalid shop ID: ${req.params.shop_id}`);
        return res.status(400).json({ error: 'INVALID SHOP ID.' });
    }

    let client;
    try {
        client = await pool.connect();
        // Query the public.shops table to get all relevant columns
        const shopResult = await client.query(`
            SELECT
                shop_id,
                shop_name,
                is_subscribed,
                ads,      -- Fetch the ads JSONB column
                banners,  -- Fetch the banners JSONB column
                offers,   -- Fetch the offers JSONB column
                top_rated,
                wallet_id,
                type,
                bookings_completed,
                credits,
                gender
            FROM public.shops
            WHERE shop_id = $1;
        `, [shop_id]);

        if (shopResult.rowCount === 0) {
            console.warn(`[GET /shops/:shop_id] Shop not found for ID: ${shop_id}`);
            return res.status(404).json({ error: 'SHOP NOT FOUND.' });
        }

        const shopData = shopResult.rows[0];
        console.log(`[GET /shops/:shop_id] Successfully fetched shop data for ID: ${shop_id}`);
        res.status(200).json(shopData);

    } catch (error) {
        console.error(`[GET /shops/:shop_id] Error fetching shop ${shop_id}:`, error.message);
        res.status(500).json({ error: 'FAILED TO FETCH SHOP DETAILS.' });
    } finally {
        if (client) client.release();
    }
});


// Fetches available subscription plans for a given shop based on its type and active season.
app.get('/shops/:shop_id/subscription-plans', async (req, res) => {
    const shop_id = parseInt(req.params.shop_id);

    if (!Number.isInteger(shop_id) || shop_id <= 0) {
        return res.status(400).json({ error: 'Invalid shop ID.' });
    }

    const client = await pool.connect();
    try {
        // 1. Get the shop's 'type' (segment)
        const shopResult = await client.query('SELECT type FROM public.shops WHERE shop_id = $1', [shop_id]);
        if (shopResult.rowCount === 0) {
            return res.status(404).json({ error: 'Shop not found.' });
        }
        const shopType = shopResult.rows[0].type; // e.g., 'premium', 'mid', 'economy'

        // 2. Fetch active subscription plans matching the shop's type and active season
        const plansResult = await client.query(`
            SELECT
                id,
                segment,
                price,
                discount_percent,
                season_type,
                season_active
            FROM
                public.subscription_fees
            WHERE
                segment = $1 AND season_active = TRUE;
        `, [shopType]);

        const plans = plansResult.rows.map(plan => {
            const discountedPrice = plan.price - (plan.price * plan.discount_percent / 100);
            return {
                ...plan,
                final_price: parseFloat(discountedPrice.toFixed(2)) // Ensure 2 decimal places
            };
        });

        res.status(200).json({ shop_id, shop_type: shopType, plans });

    } catch (error) {
        console.error(`Error fetching subscription plans for shop ${shop_id}:`, error.message);
        res.status(500).json({ error: 'Failed to fetch subscription plans.' });
    } finally {
        client.release();
    }
});

// --- POST /shops/:shop_id/create-razorpay-order ---
// Creates a Razorpay order for the selected subscription plan.
// --- POST /shops/:shop_id/create-razorpay-order ---
app.post('/shops/:shop_id/create-razorpay-order', async (req, res) => {
    console.log(`[POST /shops/:shop_id/create-razorpay-order] Request received for shop ID: ${req.params.shop_id}`);
    const shop_id = parseInt(req.params.shop_id);
    const { plan_id } = req.body;

    console.log(`[POST /shops/:shop_id/create-razorpay-order] Payload: Shop ID: ${shop_id}, Plan ID: ${plan_id}`);

    if (!Number.isInteger(shop_id) || shop_id <= 0) {
        console.error(`[POST /shops/:shop_id/create-razorpay-order] Invalid shop ID provided: ${req.params.shop_id}`);
        return res.status(400).json({ error: 'Invalid shop ID.' });
    }
    if (!Number.isInteger(plan_id) || plan_id <= 0) {
        console.error(`[POST /shops/:shop_id/create-razorpay-order] Invalid plan ID provided: ${plan_id}`);
        return res.status(400).json({ error: 'Invalid plan ID.' });
    }

    let client;
    try {
        client = await pool.connect();
        console.log(`[POST /shops/:shop_id/create-razorpay-order] Database client connected for shop ID: ${shop_id}`);

        // 1. Fetch the selected plan details
        console.log(`[POST /shops/:shop_id/create-razorpay-order] Fetching plan details for plan ID: ${plan_id}`);
        const planResult = await client.query(`
            SELECT price, discount_percent FROM public.subscription_fees WHERE id = $1 AND season_active = TRUE;
        `, [plan_id]);

        if (planResult.rowCount === 0) {
            console.warn(`[POST /shops/:shop_id/create-razorpay-order] Subscription plan not found or not active for plan ID: ${plan_id}`);
            return res.status(404).json({ error: 'Subscription plan not found or not active.' });
        }

        const { price, discount_percent } = planResult.rows[0];
        const calculatedAmount = price - (price * discount_percent / 100);
        
        // FIXED: Round to nearest rupee first, then convert to paise
        const roundedAmountInRupees = Math.round(calculatedAmount);
        const amountInPaise = roundedAmountInRupees * 100;

        console.log(`[POST /shops/:shop_id/create-razorpay-order] Plan details: Price=${price}, Discount=${discount_percent}%`);
        console.log(`[POST /shops/:shop_id/create-razorpay-order] Calculated Amount=${calculatedAmount}`);
        console.log(`[POST /shops/:shop_id/create-razorpay-order] Rounded Amount (₹)=${roundedAmountInRupees}`);
        console.log(`[POST /shops/:shop_id/create-razorpay-order] Amount in Paise=${amountInPaise}`);

        // 2. Create Razorpay order
        console.log(`[POST /shops/:shop_id/create-razorpay-order] Attempting to create Razorpay order...`);
        const order = await razorpay.orders.create({
            amount: amountInPaise,
            currency: "INR",
            receipt: `receipt_shop_${shop_id}_plan_${plan_id}_${Date.now()}`,
            notes: {
                shop_id: shop_id,
                plan_id: plan_id,
                subscription_type: 'shop'
            }
        });
        console.log(`[POST /shops/:shop_id/create-razorpay-order] Razorpay order created successfully: ${order.id}`);

        // FIXED: Send the rounded amount instead of the exact Razorpay amount
        res.status(200).json({
            order_id: order.id,
            amount: roundedAmountInRupees, // Send rounded amount (30) not exact Razorpay amount (29.5)
            currency: order.currency,
            key_id: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error(`[POST /shops/:shop_id/create-razorpay-order] Error during Razorpay order creation for shop ${shop_id}:`, error.message);
        if (error.code && error.description) {
            console.error('Razorpay Error Details:', error);
        }
        res.status(500).json({ error: 'Failed to create Razorpay order: ' + error.message });
    } finally {
        if (client) {
            client.release();
            console.log(`[POST /shops/:shop_id/create-razorpay-order] Database client released for shop ID: ${shop_id}`);
        }
    }
});

// Helper function to check subscription status and fetch current perks
async function checkSubscriptionAndGetPerks(client, shop_id, res) {
    const shopResult = await client.query(`
        SELECT is_subscribed, ads, banners, offers
        FROM public.shops
        WHERE shop_id = $1;
    `, [shop_id]);

    if (shopResult.rowCount === 0) {
        console.warn(`[Perks Route] Shop not found for ID: ${shop_id}`);
        res.status(404).json({ error: 'SHOP NOT FOUND.' });
        return null;
    }

    const shopData = shopResult.rows[0];
    if (!shopData.is_subscribed) {
        console.warn(`[Perks Route] Shop ${shop_id} is not subscribed. Access denied.`);
        res.status(403).json({ error: 'SUBSCRIPTION REQUIRED TO MANAGE PERKS.' });
        return null;
    }
    return shopData;
}

// --- PUT /shops/:shop_id/ads ---
// Manages adding, removing, or updating ads for a subscribed shop.
// Max 2 ads. Each ad must have title and either image_url or video_url.
app.put('/shops/:shop_id/ads', async (req, res) => {
    console.log(`[PUT /shops/:shop_id/ads] Request received for shop ID: ${req.params.shop_id}`);
    const shop_id = parseInt(req.params.shop_id);
    const { operation, data } = req.body; // operation: 'add', 'remove', 'update'

    if (!Number.isInteger(shop_id) || shop_id <= 0) {
        console.error(`[PUT /shops/:shop_id/ads] Invalid shop ID: ${req.params.shop_id}`);
        return res.status(400).json({ error: 'INVALID SHOP ID.' });
    }
    if (!['add', 'remove', 'update'].includes(operation)) {
        console.error(`[PUT /shops/:shop_id/ads] Invalid operation: ${operation}`);
        return res.status(400).json({ error: 'INVALID OPERATION. MUST BE ADD, REMOVE, OR UPDATE.' });
    }

    let client;
    try {
        client = await pool.connect();
        const shopData = await checkSubscriptionAndGetPerks(client, shop_id, res);
        if (!shopData) return; // Response already sent by helper

        let currentAds = shopData.ads || [];
        let message = '';

        if (operation === 'add') {
            const { title, image_url, video_url } = data;
            if (!title || (!image_url && !video_url)) {
                console.error(`[PUT /shops/:shop_id/ads] Add operation: Missing title or media URL.`);
                return res.status(400).json({ error: 'AD REQUIRES A TITLE AND EITHER AN IMAGE OR VIDEO URL.' });
            }
            if (image_url && video_url) {
                console.error(`[PUT /shops/:shop_id/ads] Add operation: Both image and video URL provided.`);
                return res.status(400).json({ error: 'AD CANNOT HAVE BOTH IMAGE AND VIDEO URLS.' });
            }
            if (currentAds.length >= 2) {
                console.warn(`[PUT /shops/:shop_id/ads] Add operation: Max ads limit reached for shop ${shop_id}.`);
                return res.status(400).json({ error: 'MAXIMUM OF 2 ADS ALLOWED.' });
            }
            currentAds.push({ title, image_url: image_url || null, video_url: video_url || null });
            message = 'AD ADDED SUCCESSFULLY.';
            console.log(`[PUT /shops/:shop_id/ads] Ad added for shop ${shop_id}. New ads count: ${currentAds.length}`);
        } else if (operation === 'remove') {
            const { url_to_remove } = data;
            if (!url_to_remove) {
                console.error(`[PUT /shops/:shop_id/ads] Remove operation: Missing URL to remove.`);
                return res.status(400).json({ error: 'URL TO REMOVE IS REQUIRED.' });
            }
            const initialLength = currentAds.length;
            currentAds = currentAds.filter(ad => ad.image_url !== url_to_remove && ad.video_url !== url_to_remove);
            if (currentAds.length === initialLength) {
                console.warn(`[PUT /shops/:shop_id/ads] Remove operation: Ad not found for URL: ${url_to_remove}`);
                return res.status(404).json({ error: 'AD NOT FOUND.' });
            }
            message = 'AD REMOVED SUCCESSFULLY.';
            console.log(`[PUT /shops/:shop_id/ads] Ad removed for shop ${shop_id}. Remaining ads: ${currentAds.length}`);
        } else if (operation === 'update') {
            const { old_url, new_title, new_image_url, new_video_url } = data;
            if (!old_url || !new_title || (!new_image_url && !new_video_url)) {
                console.error(`[PUT /shops/:shop_id/ads] Update operation: Missing required fields.`);
                return res.status(400).json({ error: 'UPDATE REQUIRES OLD URL, NEW TITLE, AND NEW MEDIA URL.' });
            }
            if (new_image_url && new_video_url) {
                console.error(`[PUT /shops/:shop_id/ads] Update operation: Cannot have both new image and video URL.`);
                return res.status(400).json({ error: 'AD CANNOT HAVE BOTH IMAGE AND VIDEO URLS.' });
            }

            const adIndex = currentAds.findIndex(ad => ad.image_url === old_url || ad.video_url === old_url);
            if (adIndex === -1) {
                console.warn(`[PUT /shops/:shop_id/ads] Update operation: Old ad not found for URL: ${old_url}`);
                return res.status(404).json({ error: 'OLD AD NOT FOUND FOR UPDATE.' });
            }
            currentAds[adIndex] = {
                title: new_title,
                image_url: new_image_url || null,
                video_url: new_video_url || null
            };
            message = 'AD UPDATED SUCCESSFULLY.';
            console.log(`[PUT /shops/:shop_id/ads] Ad updated for shop ${shop_id}.`);
        }

        await client.query('UPDATE public.shops SET ads = $1 WHERE shop_id = $2', [JSON.stringify(currentAds), shop_id]);
        res.status(200).json({ message, ads: currentAds });

    } catch (error) {
        console.error(`[PUT /shops/:shop_id/ads] Error processing ads update for shop ${shop_id}:`, error.message);
        res.status(500).json({ error: 'FAILED TO UPDATE ADS.' });
    } finally {
        if (client) client.release();
    }
});

// --- PUT /shops/:shop_id/banners ---
// Manages adding, removing, or updating banners for a subscribed shop.
// Max 2 banners. Each banner must have an image_url.
app.put('/shops/:shop_id/banners', async (req, res) => {
    console.log(`[PUT /shops/:shop_id/banners] Request received for shop ID: ${req.params.shop_id}`);
    const shop_id = parseInt(req.params.shop_id);
    const { operation, data } = req.body; // operation: 'add', 'remove', 'update'

    if (!Number.isInteger(shop_id) || shop_id <= 0) {
        console.error(`[PUT /shops/:shop_id/banners] Invalid shop ID: ${req.params.shop_id}`);
        return res.status(400).json({ error: 'INVALID SHOP ID.' });
    }
    if (!['add', 'remove', 'update'].includes(operation)) {
        console.error(`[PUT /shops/:shop_id/banners] Invalid operation: ${operation}`);
        return res.status(400).json({ error: 'INVALID OPERATION. MUST BE ADD, REMOVE, OR UPDATE.' });
    }

    let client;
    try {
        client = await pool.connect();
        const shopData = await checkSubscriptionAndGetPerks(client, shop_id, res);
        if (!shopData) return;

        let currentBanners = shopData.banners || [];
        let message = '';

        if (operation === 'add') {
            const { image_url } = data;
            if (!image_url) {
                console.error(`[PUT /shops/:shop_id/banners] Add operation: Missing image URL.`);
                return res.status(400).json({ error: 'BANNER REQUIRES AN IMAGE URL.' });
            }
            if (currentBanners.length >= 2) {
                console.warn(`[PUT /shops/:shop_id/banners] Add operation: Max banners limit reached for shop ${shop_id}.`);
                return res.status(400).json({ error: 'MAXIMUM OF 2 BANNERS ALLOWED.' });
            }
            currentBanners.push({ image_url });
            message = 'BANNER ADDED SUCCESSFULLY.';
            console.log(`[PUT /shops/:shop_id/banners] Banner added for shop ${shop_id}. New banners count: ${currentBanners.length}`);
        } else if (operation === 'remove') {
            const { url_to_remove } = data;
            if (!url_to_remove) {
                console.error(`[PUT /shops/:shop_id/banners] Remove operation: Missing URL to remove.`);
                return res.status(400).json({ error: 'URL TO REMOVE IS REQUIRED.' });
            }
            const initialLength = currentBanners.length;
            currentBanners = currentBanners.filter(banner => banner.image_url !== url_to_remove);
            if (currentBanners.length === initialLength) {
                console.warn(`[PUT /shops/:shop_id/banners] Remove operation: Banner not found for URL: ${url_to_remove}`);
                return res.status(404).json({ error: 'BANNER NOT FOUND.' });
            }
            message = 'BANNER REMOVED SUCCESSFULLY.';
            console.log(`[PUT /shops/:shop_id/banners] Banner removed for shop ${shop_id}. Remaining banners: ${currentBanners.length}`);
        } else if (operation === 'update') {
            const { old_url, new_image_url } = data;
            if (!old_url || !new_image_url) {
                console.error(`[PUT /shops/:shop_id/banners] Update operation: Missing old or new URL.`);
                return res.status(400).json({ error: 'UPDATE REQUIRES OLD AND NEW IMAGE URLS.' });
            }
            const bannerIndex = currentBanners.findIndex(banner => banner.image_url === old_url);
            if (bannerIndex === -1) {
                console.warn(`[PUT /shops/:shop_id/banners] Update operation: Old banner not found for URL: ${old_url}`);
                return res.status(404).json({ error: 'OLD BANNER NOT FOUND FOR UPDATE.' });
            }
            currentBanners[bannerIndex] = { image_url: new_image_url };
            message = 'BANNER UPDATED SUCCESSFULLY.';
            console.log(`[PUT /shops/:shop_id/banners] Banner updated for shop ${shop_id}.`);
        }

        await client.query('UPDATE public.shops SET banners = $1 WHERE shop_id = $2', [JSON.stringify(currentBanners), shop_id]);
        res.status(200).json({ message, banners: currentBanners });

    } catch (error) {
        console.error(`[PUT /shops/:shop_id/banners] Error processing banners update for shop ${shop_id}:`, error.message);
        res.status(500).json({ error: 'FAILED TO UPDATE BANNERS.' });
    } finally {
        if (client) client.release();
    }
});

// --- PUT /shops/:shop_id/offers ---
// Manages adding, removing, or updating offers for a subscribed shop.
// Max 5 offers. Each offer must have title and discount.
app.put('/shops/:shop_id/offers', async (req, res) => {
    console.log(`[PUT /shops/:shop_id/offers] Request received for shop ID: ${req.params.shop_id}`);
    const shop_id = parseInt(req.params.shop_id);
    const { operation, data } = req.body; // operation: 'add', 'remove', 'update'

    if (!Number.isInteger(shop_id) || shop_id <= 0) {
        console.error(`[PUT /shops/:shop_id/offers] Invalid shop ID: ${req.params.shop_id}`);
        return res.status(400).json({ error: 'INVALID SHOP ID.' });
    }
    if (!['add', 'remove', 'update'].includes(operation)) {
        console.error(`[PUT /shops/:shop_id/offers] Invalid operation: ${operation}`);
        return res.status(400).json({ error: 'INVALID OPERATION. MUST BE ADD, REMOVE, OR UPDATE.' });
    }

    let client;
    try {
        client = await pool.connect();
        const shopData = await checkSubscriptionAndGetPerks(client, shop_id, res);
        if (!shopData) return;

        let currentOffers = shopData.offers || [];
        let message = '';

        if (operation === 'add') {
            const { title, discount } = data;
            if (!title || typeof discount !== 'number' || discount < 0) {
                console.error(`[PUT /shops/:shop_id/offers] Add operation: Missing title or invalid discount.`);
                return res.status(400).json({ error: 'OFFER REQUIRES A TITLE AND A VALID DISCOUNT PERCENTAGE.' });
            }
            if (currentOffers.length >= 5) {
                console.warn(`[PUT /shops/:shop_id/offers] Add operation: Max offers limit reached for shop ${shop_id}.`);
                return res.status(400).json({ error: 'MAXIMUM OF 5 OFFERS ALLOWED.' });
            }
            currentOffers.push({ title, discount });
            message = 'OFFER ADDED SUCCESSFULLY.';
            console.log(`[PUT /shops/:shop_id/offers] Offer added for shop ${shop_id}. New offers count: ${currentOffers.length}`);
        } else if (operation === 'remove') {
            const { title_to_remove } = data;
            if (!title_to_remove) {
                console.error(`[PUT /shops/:shop_id/offers] Remove operation: Missing title to remove.`);
                return res.status(400).json({ error: 'TITLE TO REMOVE IS REQUIRED.' });
            }
            const initialLength = currentOffers.length;
            currentOffers = currentOffers.filter(offer => offer.title !== title_to_remove);
            if (currentOffers.length === initialLength) {
                console.warn(`[PUT /shops/:shop_id/offers] Remove operation: Offer not found for title: ${title_to_remove}`);
                return res.status(404).json({ error: 'OFFER NOT FOUND.' });
            }
            message = 'OFFER REMOVED SUCCESSFULLY.';
            console.log(`[PUT /shops/:shop_id/offers] Offer removed for shop ${shop_id}. Remaining offers: ${currentOffers.length}`);
        } else if (operation === 'update') {
            const { old_title, new_title, new_discount } = data;
            if (!old_title || !new_title || typeof new_discount !== 'number' || new_discount < 0) {
                console.error(`[PUT /shops/:shop_id/offers] Update operation: Missing required fields or invalid discount.`);
                return res.status(400).json({ error: 'UPDATE REQUIRES OLD TITLE, NEW TITLE, AND A VALID NEW DISCOUNT.' });
            }
            const offerIndex = currentOffers.findIndex(offer => offer.title === old_title);
            if (offerIndex === -1) {
                console.warn(`[PUT /shops/:shop_id/offers] Update operation: Old offer not found for title: ${old_title}`);
                return res.status(404).json({ error: 'OLD OFFER NOT FOUND FOR UPDATE.' });
            }
            currentOffers[offerIndex] = { title: new_title, discount: new_discount };
            message = 'OFFER UPDATED SUCCESSFULLY.';
            console.log(`[PUT /shops/:shop_id/offers] Offer updated for shop ${shop_id}.`);
        }

        await client.query('UPDATE public.shops SET offers = $1 WHERE shop_id = $2', [JSON.stringify(currentOffers), shop_id]);
        res.status(200).json({ message, offers: currentOffers });

    } catch (error) {
        console.error(`[PUT /shops/:shop_id/offers] Error processing offers update for shop ${shop_id}:`, error.message);
        res.status(500).json({ error: 'FAILED TO UPDATE OFFERS.' });
    } finally {
        if (client) client.release();
    }
});

// --- POST /shops/:shop_id/verify-payment ---
// Verifies Razorpay payment and updates shop's subscription status.
app.post('/shops/:shop_id/verify-payment', async (req, res) => {
    const shop_id = parseInt(req.params.shop_id);
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        plan_id
    } = req.body;

    if (!Number.isInteger(shop_id) || shop_id <= 0) {
        return res.status(400).json({ error: 'Invalid shop ID.' });
    }
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !plan_id) {
        return res.status(400).json({ error: 'Missing payment verification details.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Start transaction

        // 1. Verify payment signature
        const crypto = require('crypto');
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
        const generated_signature = hmac.digest('hex');

        if (generated_signature !== razorpay_signature) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Payment verification failed: Invalid signature.' });
        }

        // 2. Fetch plan details to ensure correct amount was paid
        const planResult = await client.query(`
            SELECT price, discount_percent FROM public.subscription_fees WHERE id = $1 AND season_active = TRUE;
        `, [plan_id]);

        if (planResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Subscription plan not found or not active during verification.' });
        }
        const { price, discount_percent } = planResult.rows[0];
        const expectedAmount = price - (price * discount_percent / 100);

        // Optional: Verify the amount paid with Razorpay API (more robust)
        // const payment = await instance.payments.fetch(razorpay_payment_id);
        // if (payment.amount / 100 !== expectedAmount) {
        //     await client.query('ROLLBACK');
        //     return res.status(400).json({ error: 'Payment verification failed: Amount mismatch.' });
        // }

        // 3. Get shop's wallet_id
        const shopWalletResult = await client.query('SELECT wallet_id FROM public.shops WHERE shop_id = $1', [shop_id]);
        if (shopWalletResult.rowCount === 0 || !shopWalletResult.rows[0].wallet_id) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Shop or shop wallet not found.' });
        }
        const shopWalletId = shopWalletResult.rows[0].wallet_id;

        // 4. Update shop status and benefits
        await client.query(`
            UPDATE public.shops
            SET
                is_subscribed = TRUE,
                credits = 31, -- Set credits to 31 for a month's subscription
                ads = '[]'::jsonb,      -- Reset ads (or set default content)
                banners = '[]'::jsonb,  -- Reset banners (or set default content)
                offers = '[]'::jsonb,   -- Reset offers (or set default content)
                top_rated = TRUE        -- Grant top-rated status
            WHERE shop_id = $1;
        `, [shop_id]);

        // 5. Insert transaction into wallet_transactions_shop
        await client.query(`
            INSERT INTO public.wallet_transactions_shop (
                shop_id, wallet_id, amount, type, balance, status, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW());
        `, [
            shop_id,
            shopWalletId,
            expectedAmount, // The actual amount paid for subscription
            'subscription', // Type: 'subscription'
            0,              // Balance: 0 as it's a payment for service, not a wallet credit/debit
            'Paid'          // Status: 'Paid'
        ]);

        await client.query('COMMIT'); // Commit transaction

        res.status(200).json({ message: 'Payment successful and subscription activated!', shop_id });

    } catch (error) {
        await client.query('ROLLBACK'); // Rollback transaction on error
        console.error(`Error verifying payment for shop ${shop_id}:`, error.message);
        res.status(500).json({ error: 'Failed to verify payment: ' + error.message });
    } finally {
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
    SET status = 'Withdrawn', balance = -amount, type = 'withdrawal'
    WHERE id = $1;
`;
await client.query(updateTransactionQuery, [transactionId]);


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



//admin for shops

app.get('/admin/shop-wallet-transactions', async (req, res) => {
  try {
    const query = `
      SELECT
        wts.id,
        wts.shop_id,
        wts.amount,
        wts.type,
        wts.status,
        wts.upi_id,
        wts.created_at,
        s.shop_name AS shop_name,
        s.ph_number AS ph_number
      FROM wallet_transactions_shop wts
      JOIN shops s ON wts.shop_id = s.shop_id
      ORDER BY wts.created_at DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching all shop wallet transactions:', err);
    res.status(500).json({ error: 'Failed to fetch shop transactions.' });
  }
});

app.get('/admin/shop/pay-withdrawal/:transactionId', async (req, res) => {
  const { transactionId } = req.params;

  try {
    // 1. Fetch the transaction to verify its status and get shop/amount details.
    const transactionResult = await pool.query(
      `SELECT shop_id, amount, upi_id FROM wallet_transactions_shop WHERE id = $1 AND status = 'Requested';`,
      [transactionId]
    );

    if (transactionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found or not in a "Requested" state.' });
    }

    const { shop_id, amount, upi_id } = transactionResult.rows[0];

    // 2. Parse the 'amount' string to a float before using toFixed().
    const numericAmount = parseFloat(amount);

    // 3. Generate and return a UPI payment link for the admin to use.
    // Use the numericAmount variable here.
    const upiLink = `upi://pay?pa=${upi_id}&pn=Shop%20Wallet%20Withdrawal&am=${numericAmount.toFixed(2)}&cu=INR`;

    res.status(200).json({
      message: 'UPI link generated successfully.',
      upiLink,
      shopId: shop_id,
      amount: numericAmount, // Return the numeric amount
    });
  } catch (err) {
    console.error('Error fetching shop withdrawal details:', err);
    res.status(500).json({ error: 'An error occurred while fetching shop withdrawal details.' });
  }
});

app.put('/admin/shop/confirm-withdrawal/:transactionId', async (req, res) => {
  const { transactionId } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN'); // Start a database transaction

    // 1. Fetch the transaction
    const transactionQuery = `
      SELECT shop_id, amount, status
      FROM wallet_transactions_shop
      WHERE id = $1 FOR UPDATE;
    `;
    const transactionResult = await client.query(transactionQuery, [transactionId]);

    if (transactionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const transaction = transactionResult.rows[0];

    // 2. Check if the transaction is still 'Requested'
    if (transaction.status !== 'Requested') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Transaction has already been processed.' });
    }

    // 3. Update the transaction
    const updateTransactionQuery = `
      UPDATE wallet_transactions_shop
      SET status = 'Withdrawn', balance = -amount, type = 'withdrawal'
      WHERE id = $1;
    `;
    await client.query(updateTransactionQuery, [transactionId]);

    await client.query('COMMIT'); // Commit the transaction

    // 4. Send push notification to the shop
    try {
      // Recalculate the shop's balance after withdrawal
      const balanceQuery = `
        SELECT SUM(balance) AS total_balance FROM wallet_transactions_shop WHERE shop_id = $1;
      `;
      const balanceResult = await pool.query(balanceQuery, [transaction.shop_id]);
      const newBalance = balanceResult.rows[0].total_balance ? parseFloat(balanceResult.rows[0].total_balance) : 0;
      
      const payload = {
        title: 'Withdrawal Confirmed!',
        body: `Withdrawal of ₹${parseFloat(transaction.amount).toFixed(2)} has been successfully processed. Your new wallet balance is ₹${newBalance.toFixed(2)}.`,
      };
      // Assume a function sendNotificationToShop exists
      await sendNotificationToShop(transaction.shop_id, payload);
    } catch (notificationError) {
      console.error('Error sending push notification to shop:', notificationError);
      // Log the error but don't fail the API call
    }

    // 5. Respond to the client
    res.status(200).json({
      message: 'Shop withdrawal successfully confirmed and wallet updated.',
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error confirming shop withdrawal:', err);
    res.status(500).json({ error: 'An error occurred while confirming the shop withdrawal.' });
  } finally {
    client.release();
  }
});


// --- Get Shop Fee Override Status ---
// --- Get Shop Fee Override Status ---
app.get('/shops/:shop_id/fee-status', async (req, res) => {
    const shop_id = parseInt(req.params.shop_id);

    if (!Number.isInteger(shop_id) || shop_id <= 0) {
        return res.status(400).json({ error: 'Invalid shop_id' });
    }

    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT status FROM public.shop_booking_fee_overrides
            WHERE shop_id = $1
        `, [shop_id]);

        if (result.rowCount === 0) {
            // If no override exists, assume 'normal' as per default
            return res.status(200).json({ shop_id: shop_id, status: 'normal', message: 'No specific override found, defaulting to normal.' });
        }

        res.status(200).json({ shop_id: shop_id, status: result.rows[0].status });
    } catch (error) {
        console.error('Error fetching shop fee status:', error.message);
        res.status(500).json({ error: 'Failed to fetch shop fee status' });
    } finally {
        client.release();
    }
});

// --- Update Shop Fee Override Status ---
app.put('/shops/:shop_id/fee-status', async (req, res) => {
    const shop_id = parseInt(req.params.shop_id);
    const { status } = req.body; // Expected: 'normal', 'high', 'low'

    if (!Number.isInteger(shop_id) || shop_id <= 0) {
        return res.status(400).json({ error: 'Invalid shop_id' });
    }

    const validStatuses = ['normal', 'high', 'low'];
    if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const client = await pool.connect();
    try {
        // Check if the shop exists
        const shopExists = await client.query('SELECT shop_id FROM public.shops WHERE shop_id = $1', [shop_id]);
        if (shopExists.rowCount === 0) {
            return res.status(404).json({ error: 'Shop not found.' });
        }

        // Upsert logic: Update if exists, Insert if not
        const result = await client.query(`
            INSERT INTO public.shop_booking_fee_overrides (shop_id, status)
            VALUES ($1, $2)
            ON CONFLICT (shop_id) DO UPDATE
            SET status = EXCLUDED.status
            RETURNING *;
        `, [shop_id, status]);

        res.status(200).json({
            message: `Shop ${shop_id} fee status updated to '${status}'`,
            override: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating shop fee status:', error.message);
        res.status(500).json({ error: 'Failed to update shop fee status' });
    } finally {
        client.release();
    }
});





// New Backend Route to get calculated booking fee for a shop
app.get('/shops/:shop_id/booking-fee', async (req, res) => {
    const shop_id = parseInt(req.params.shop_id);

    if (!Number.isInteger(shop_id) || shop_id <= 0) {
        return res.status(400).json({ error: 'Invalid shop_id' });
    }

    const client = await pool.connect();
    try {
        // 1. Get shop type (segment)
        const shopResult = await client.query(
            'SELECT type FROM public.shops WHERE shop_id = $1 AND is_active = TRUE',
            [shop_id]
        );

        if (shopResult.rowCount === 0) {
            return res.status(404).json({ error: 'Shop not found or inactive' });
        }
        const shopType = shopResult.rows[0].type;

        // 2. Query active season booking fees for the shop's segment
        const bookingFeesResult = await client.query(`
            SELECT base_fee, high_rush_fee, low_rush_fee, discount_percent
            FROM public.booking_fees
            WHERE segment = $1 AND season_active = TRUE
        `, [shopType]);

        if (bookingFeesResult.rowCount === 0) {
            // If no active rule, default to 0 fee and 0 discount
            return res.status(200).json({ fee: 0, discount_percent: 0, message: 'No active booking fee rule found for shop segment. Fee is 0.' });
        }

        const { base_fee, high_rush_fee, low_rush_fee, discount_percent } = bookingFeesResult.rows[0];

        // 3. Check shop_booking_fee_overrides for the specific shop
        const shopOverrideResult = await client.query(`
            SELECT status FROM public.shop_booking_fee_overrides
            WHERE shop_id = $1
        `, [shop_id]);

        let overrideStatus = 'normal'; // Default to normal if no override exists
        if (shopOverrideResult.rowCount > 0) {
            overrideStatus = shopOverrideResult.rows[0].status;
        }

        // 4. Apply the correct fee based on override status
        let calculatedFees = 0;
        switch (overrideStatus) {
            case 'normal':
                calculatedFees = base_fee;
                break;
            case 'high':
                calculatedFees = high_rush_fee;
                break;
            case 'low':
                calculatedFees = low_rush_fee;
                break;
            default:
                calculatedFees = base_fee; // Fallback
        }

        // 5. Apply discount if applicable
        let finalFee = calculatedFees;
        if (discount_percent > 0) {
            finalFee = calculatedFees * (1 - discount_percent / 100);
        }
        finalFee = Math.round(finalFee); // Ensure integer amount

        res.status(200).json({ fee: finalFee, discount_percent: discount_percent });

    } catch (error) {
        console.error('Error fetching calculated booking fee:', error.message);
        res.status(500).json({ error: 'Failed to fetch calculated booking fee' });
    } finally {
        client.release();
    }
});

//create razorpay order booking fees payment

// --- Booking Creation Route ---
app.post('/bookings', async (req, res) => {
    const { shop_id, emp_id, customer_id, service_ids, booking_fee_paid } = req.body;

    // --- Validation & Initial Setup ---
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
        await updateBookingStatuses(client); // Ensure booking statuses are up-to-date

        const currentTime = dayjs().utc().toDate();

        const shopCheck = await client.query('SELECT shop_id, shop_name, type FROM public.shops WHERE shop_id = $1 AND is_active = TRUE', [shop_id]);
        if (shopCheck.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Shop not found or inactive' });
        }
        const shopType = shopCheck.rows[0].type; // Get shop segment (premium, mid, economy)

        const empCheck = await client.query('SELECT emp_id, emp_name FROM public.employees WHERE emp_id = $1 AND shop_id = $2 AND is_active = TRUE', [emp_id, shop_id]);
        if (empCheck.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Employee not found, inactive, or does not belong to this shop' });
        }

        let customerName = 'Walk-in Customer';
        if (customer_id > 0) {
            const customerCheck = await client.query('SELECT customer_id, customer_name FROM public.customers WHERE customer_id = $1', [customer_id]);
            if (customerCheck.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Customer not found' });
            }
            customerName = customerCheck.rows[0].customer_name;

            const existingBookingForCustomer = await client.query(`
                SELECT booking_id FROM public.bookings
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
            SELECT es.service_id FROM public.employee_services es
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
            FROM public.services
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
            FROM public.bookings
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

        // --- Calculate Booking Fees ---
        let calculatedFees = 0;
        if (customer_id > 0) { // Only calculate fees for registered customers
            const bookingFeesResult = await client.query(`
                SELECT base_fee, high_rush_fee, low_rush_fee, discount_percent
                FROM public.booking_fees
                WHERE segment = $1 AND season_active = TRUE
            `, [shopType]);

            if (bookingFeesResult.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(500).json({ error: 'No active booking fee rule found for shop segment' });
            }

            const { base_fee, high_rush_fee, low_rush_fee, discount_percent } = bookingFeesResult.rows[0];

            const shopOverrideResult = await client.query(`
                SELECT status FROM public.shop_booking_fee_overrides
                WHERE shop_id = $1
            `, [shop_id]);

            let overrideStatus = 'normal';
            if (shopOverrideResult.rowCount > 0) {
                overrideStatus = shopOverrideResult.rows[0].status;
            }

            switch (overrideStatus) {
                case 'normal':
                    calculatedFees = base_fee;
                    break;
                case 'high':
                    calculatedFees = high_rush_fee;
                    break;
                case 'low':
                    calculatedFees = low_rush_fee;
                    break;
                default:
                    calculatedFees = base_fee; // Fallback
            }

            if (discount_percent > 0) {
                calculatedFees = calculatedFees * (1 - discount_percent / 100);
            }
            calculatedFees = Math.round(calculatedFees); // Ensure integer fee
        }

        const insertBookingQuery = `
            INSERT INTO public.bookings (
                shop_id, emp_id, customer_id,
                service_type, join_time, service_duration_minutes, end_time, status, fees
            )
            VALUES ($1, $2, $3, $4::json, $5, $6, $7, $8, $9)
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
            initialStatus,
            calculatedFees // Insert the calculated fees
        ];
        const { rows: bookingRows } = await client.query(insertBookingQuery, bookingValues);
        const newBooking = bookingRows[0];

        // --- Wallet Transaction Logic ---
        if (customer_id > 0) {
            const walletTransactionQuery = `
                INSERT INTO public.wallet_transactions (
                    customer_id, wallet_id, booking_id, amount, type, balance, status
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `;
            const walletStatus = booking_fee_paid ? 'Paid' : 'Refund';
            const walletValues = [
                customer_id,
                customer_id, // wallet_id is the same as customer_id for customers
                newBooking.booking_id,
                calculatedFees, // Use the calculated fees here
                'bookingfees',
                0, // Balance is 0 for booking fee transactions as per your example
                walletStatus
            ];
            await client.query(walletTransactionQuery, walletValues);
        }
        // --- End of Wallet Transaction Logic ---

        await client.query('COMMIT');
        const queuePosition = await client.query(`
            SELECT COUNT(*) + 1 as position
            FROM public.bookings
            WHERE emp_id = $1
            AND status = 'booked'
            AND join_time < $2
        `, [emp_id, actualJoinTimeUTC]);

        if (customer_id > 0) {
            await sendNotificationToCustomer(customer_id, {
                title: 'Booking Confirmed!',
                body: `Your booking (ID: ${newBooking.booking_id}) at ${shopCheck.rows[0].shop_name} with ${empCheck.rows[0].emp_name} is confirmed for ${dayjs(actualJoinTime).tz('Asia/Kolkata').format('hh:mm A')}. Total fees: ₹${calculatedFees}.`,
                url: `/userdashboard`,
                bookingId: newBooking.booking_id,
                type: 'new_booking_customer',
            });
        }

        await sendNotificationToShop(shop_id, {
            title: 'New Booking Received!',
            body: `A new booking (ID: ${newBooking.booking_id}) has been made with ${empCheck.rows[0].emp_name} for ${customerName} at ${dayjs(actualJoinTime).tz('Asia/Kolkata').format('hh:mm A')}. Total fees: ₹${calculatedFees}.`,
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


app.post('/create-razorpay-order', async (req, res) => {
    try {
        const { shop_id } = req.body; // Expecting shop_id from the request

        if (!shop_id || !Number.isInteger(shop_id) || shop_id <= 0) {
            return res.status(400).json({ error: 'Valid shop_id is required' });
        }

        const client = await pool.connect();
        let amountToCharge = 0;

        try {
            // 1. Get shop type (segment)
            const shopResult = await client.query(
                'SELECT type FROM public.shops WHERE shop_id = $1 AND is_active = TRUE',
                [shop_id]
            );

            if (shopResult.rowCount === 0) {
                return res.status(404).json({ error: 'Shop not found or inactive' });
            }
            const shopType = shopResult.rows[0].type;

            // 2. Query active season booking fees for the shop's segment
            const bookingFeesResult = await client.query(`
                SELECT base_fee, high_rush_fee, low_rush_fee, discount_percent
                FROM public.booking_fees
                WHERE segment = $1 AND season_active = TRUE
            `, [shopType]);

            if (bookingFeesResult.rowCount === 0) {
                return res.status(500).json({ error: 'No active booking fee rule found for shop segment' });
            }

            const { base_fee, high_rush_fee, low_rush_fee, discount_percent } = bookingFeesResult.rows[0];

            // 3. Check shop_booking_fee_overrides for the specific shop
            const shopOverrideResult = await client.query(`
                SELECT status FROM public.shop_booking_fee_overrides
                WHERE shop_id = $1
            `, [shop_id]);

            let overrideStatus = 'normal'; // Default to normal if no override exists
            if (shopOverrideResult.rowCount > 0) {
                overrideStatus = shopOverrideResult.rows[0].status;
            }

            // 4. Apply the correct fee based on override status
            switch (overrideStatus) {
                case 'normal':
                    amountToCharge = base_fee;
                    break;
                case 'high':
                    amountToCharge = high_rush_fee;
                    break;
                case 'low':
                    amountToCharge = low_rush_fee;
                    break;
                default:
                    amountToCharge = base_fee; // Fallback
            }

            // 5. Apply discount if applicable
            if (discount_percent > 0) {
                amountToCharge = amountToCharge * (1 - discount_percent / 100);
            }
            amountToCharge = Math.round(amountToCharge); // Ensure integer amount for Razorpay

            if (amountToCharge <= 0) {
                return res.status(400).json({ error: 'Calculated fee is zero or invalid.' });
            }

            const options = {
                amount: amountToCharge * 100, // Amount is in currency subunits (paise for INR)
                currency: 'INR',
                receipt: 'receipt_shop_fee_' + shop_id + '_' + Date.now(), // Unique receipt
                notes: {
                    shop_id: shop_id,
                    fee_type: overrideStatus,
                    base_fee_rule: bookingFeesResult.rows[0].id // Reference the booking_fees rule
                }
            };

            const order = await razorpay.orders.create(options);
            console.log("Razorpay Order Created:", order);
            res.status(200).json(order);

        } catch (error) {
            console.error('Error creating Razorpay order:', error);
            res.status(500).json({ error: 'Failed to create Razorpay order' });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Unhandled error in Razorpay order creation:', error);
        res.status(500).json({ error: 'An unexpected error occurred.' });
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

        if (['completed', 'cancelled', 'cancelled_by_shop'].includes(bookingToCancel.status)) { // Added 'cancelled_by_shop' here
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Booking is already ${bookingToCancel.status}. Cannot cancel.` });
        }

        const { emp_id, join_time, end_time, service_duration_minutes, customer_id } = bookingToCancel;

        // 3. Update Booking Status to 'cancelled_by_shop'
        const cancelQuery = `
            UPDATE bookings
            SET status = 'cancelled_by_shop'
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
                title: 'Booking Cancelled by Shop!', // Updated title
                body: `Your booking (ID: ${booking_id}) on ${dayjs.utc(join_time).tz('Asia/Kolkata').format('YYYY-MM-DD')} at ${dayjs.utc(join_time).tz('Asia/Kolkata').format('hh:mm A')} has been cancelled by the shop.`, // Updated body
                url: `/userdashboard`, // Link to customer's dashboard or specific booking
                bookingId: booking_id,
                type: 'booking_cancelled_by_shop', // Custom type for client-side handling
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
            message: 'Booking cancelled successfully by shop', // Updated message
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

async function shiftBookingsDueToDelay(client, empId, delayedBookingOriginalEndTimeUTC, delayMinutes, shopId) {
    console.log(`Shifting subsequent bookings for employee ${empId} due to a ${delayMinutes} minute delay.`);

    // Fetch bookings for the employee that start at or after the original end time of the delayed booking
    const subsequentBookingsQuery = `
        SELECT booking_id, customer_id, join_time, end_time, service_duration_minutes, status
        FROM bookings
        WHERE emp_id = $1
        AND status IN ('booked', 'in_service')
        AND join_time >= $2
        ORDER BY join_time ASC;
    `;
    const { rows: subsequentBookings } = await client.query(subsequentBookingsQuery, [empId, delayedBookingOriginalEndTimeUTC]);

    if (subsequentBookings.length === 0) {
        console.log(`No subsequent bookings found for employee ${empId} after ${dayjs.utc(delayedBookingOriginalEndTimeUTC).format()}.`);
        return;
    }

    const delayMs = delayMinutes * 60000; // Convert minutes to milliseconds

    for (const booking of subsequentBookings) {
        // Parse original times as UTC Date objects
        const originalJoinTime = dayjs.utc(booking.join_time).toDate();
        const originalEndTime = dayjs.utc(booking.end_time).toDate();
        const customerId = booking.customer_id;

        // Calculate new join and end times by adding the delay
        const newJoinTime = new Date(originalJoinTime.getTime() + delayMs);
        const newEndTime = new Date(originalEndTime.getTime() + delayMs);

        // Convert new times to UTC Date objects for database insertion
        const newJoinTimeUTC = dayjs(newJoinTime).utc().toDate();
        const newEndTimeUTC = dayjs(newEndTime).utc().toDate();

        // Update the booking in the database
        await client.query(
            `UPDATE bookings
             SET join_time = $1, end_time = $2
             WHERE booking_id = $3`,
            [newJoinTimeUTC, newEndTimeUTC, booking.booking_id]
        );
        console.log(`Shifted booking ${booking.booking_id}: Old join_time: ${dayjs.utc(originalJoinTime).tz('Asia/Kolkata').format('hh:mm A')}, New join_time: ${dayjs.utc(newJoinTime).tz('Asia/Kolkata').format('hh:mm A')}`);

        // Notify Customer about time shift
        if (customerId) {
            await sendNotificationToCustomer(customerId, {
                title: 'Booking Delayed!',
                body: `Your booking (ID: ${booking.booking_id}) has been delayed by ${delayMinutes} minutes. New start time: ${dayjs.utc(newJoinTime).tz('Asia/Kolkata').format('hh:mm A')}.`,
                url: `/userdashboard`,
                bookingId: booking.booking_id,
                type: 'time_delayed',
            });
        }

        // Notify Shop about queue changes
        if (shopId) {
            const empNameResult = await client.query(`SELECT emp_name FROM employees WHERE emp_id = $1`, [empId]);
            const empName = empNameResult.rows[0]?.emp_name || 'an employee';
            const customerNameResult = await client.query(`SELECT customer_name FROM customers WHERE customer_id = $1`, [customerId]);
            const customerName = customerNameResult.rows[0]?.customer_name || 'A customer';

            await sendNotificationToShop(shopId, {
                title: 'Queue Updated!',
                body: `Booking (ID: ${booking.booking_id}) for ${customerName} with ${empName} has been delayed. New start time: ${dayjs.utc(newJoinTime).tz('Asia/Kolkata').format('hh:mm A')}.`,
                url: `/shopdashboard`,
                bookingId: booking.booking_id,
                type: 'shop_queue_update',
            });
        }
    }
}

app.put('/editbookingbyshops', async (req, res) => {
    // Expected request body: { booking_id: number, shop_id: number, delay_minutes: number }
    const { booking_id, shop_id, delay_minutes } = req.body;

    // --- Validation ---
    if (!booking_id || !shop_id || delay_minutes === undefined || delay_minutes <= 0) {
        return res.status(400).json({
            error: 'Missing or invalid required fields: booking_id, shop_id, delay_minutes (must be a positive number)'
        });
    }
    if (!Number.isInteger(booking_id) || booking_id <= 0) {
        return res.status(400).json({ error: 'booking_id must be a positive integer' });
    }
    if (!Number.isInteger(shop_id) || shop_id <= 0) {
        return res.status(400).json({ error: 'shop_id must be a positive integer' });
    }
    if (!Number.isInteger(delay_minutes) || delay_minutes <= 0) {
        return res.status(400).json({ error: 'delay_minutes must be a positive integer' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Start transaction

        // 1. Fetch the booking to be delayed
        const bookingResult = await client.query(
            `SELECT booking_id, shop_id, emp_id, customer_id, join_time, end_time, service_duration_minutes, status
             FROM bookings
             WHERE booking_id = $1 FOR UPDATE;`, // FOR UPDATE locks the row
            [booking_id]
        );

        if (bookingResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Booking not found' });
        }

        const booking = bookingResult.rows[0];

        // Authorization check: Ensure the shop_id matches the booking's shop_id
        if (booking.shop_id !== shop_id) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Unauthorized: This booking does not belong to your shop.' });
        }

        // Only allow modification for 'booked' or 'in_service' bookings
        if (!['booked', 'in_service'].includes(booking.status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Booking status '${booking.status}' cannot be modified.` });
        }

        const originalEndTime = dayjs.utc(booking.end_time).toDate(); // Original end time in UTC
        const newEndTime = new Date(originalEndTime.getTime() + delay_minutes * 60000); // Calculate new end time
        const newServiceDurationMinutes = booking.service_duration_minutes + delay_minutes;

        // 2. Update the current booking's end_time and service_duration_minutes
        await client.query(
            `UPDATE bookings
             SET end_time = $1, service_duration_minutes = $2
             WHERE booking_id = $3;`,
            [dayjs(newEndTime).utc().toDate(), newServiceDurationMinutes, booking_id] // Store new end time as UTC
        );
        console.log(`Booking ${booking_id} end_time extended by ${delay_minutes} minutes. New end_time: ${dayjs(newEndTime).tz('Asia/Kolkata').format('hh:mm A')}`);

        // 3. Shift subsequent bookings and send notifications
        await shiftBookingsDueToDelay(client, booking.emp_id, originalEndTime, delay_minutes, shop_id);

        await client.query('COMMIT'); // Commit transaction

        res.status(200).json({
            message: `Booking ${booking_id} successfully delayed by ${delay_minutes} minutes. Subsequent bookings have been shifted.`,
            updatedBooking: {
                booking_id: booking.booking_id,
                new_end_time: dayjs(newEndTime).tz('Asia/Kolkata').format('MMM DD, YYYY - hh:mm A'),
                new_service_duration_minutes: newServiceDurationMinutes
            }
        });

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK'); // Rollback transaction on error
        }
        console.error('Error in /editbookingbyshops:', error);
        res.status(500).json({
            error: 'Failed to update booking time',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (client) {
            client.release(); // Release client back to pool
        }
    }
});


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
