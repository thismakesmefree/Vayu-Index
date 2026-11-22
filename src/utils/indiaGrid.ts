export interface IndiaAqiPoint {
  id: string;
  name: string;
  state: string;
  region: 'North' | 'West' | 'Central' | 'East' | 'Northeast' | 'South' | 'Islands';
  lat: number;
  lon: number;
}

/**
 * Sample coordinates across India for modeled AQI and weather lookups.
 * These are not ground-monitoring station observations.
 */
export const PAN_INDIA_AQI_POINTS: IndiaAqiPoint[] = [
  // North & Himalayan Belt
  { id: 'in-srinagar', name: 'Srinagar', state: 'J&K', region: 'North', lat: 34.0837, lon: 74.7973 },
  { id: 'in-leh', name: 'Leh', state: 'Ladakh', region: 'North', lat: 34.1526, lon: 77.5771 },
  { id: 'in-jammu', name: 'Jammu', state: 'J&K', region: 'North', lat: 32.7266, lon: 74.857 },
  { id: 'in-shimla', name: 'Shimla', state: 'Himachal Pradesh', region: 'North', lat: 31.1048, lon: 77.1734 },
  { id: 'in-amritsar', name: 'Amritsar', state: 'Punjab', region: 'North', lat: 31.634, lon: 74.8723 },
  { id: 'in-chandigarh', name: 'Chandigarh', state: 'Chandigarh', region: 'North', lat: 30.7333, lon: 76.7794 },
  { id: 'in-dehradun', name: 'Dehradun', state: 'Uttarakhand', region: 'North', lat: 30.3165, lon: 78.0322 },
  { id: 'in-delhi', name: 'New Delhi', state: 'Delhi NCR', region: 'North', lat: 28.6139, lon: 77.209 },
  { id: 'in-gurugram', name: 'Gurugram', state: 'Haryana', region: 'North', lat: 28.4595, lon: 77.0266 },
  { id: 'in-noida', name: 'Noida', state: 'Uttar Pradesh', region: 'North', lat: 28.5355, lon: 77.391 },
  { id: 'in-agra', name: 'Agra', state: 'Uttar Pradesh', region: 'North', lat: 27.1767, lon: 78.0081 },
  { id: 'in-jaipur', name: 'Jaipur', state: 'Rajasthan', region: 'North', lat: 26.9124, lon: 75.7873 },
  { id: 'in-jodhpur', name: 'Jodhpur', state: 'Rajasthan', region: 'North', lat: 26.2389, lon: 73.0243 },
  { id: 'in-udaipur', name: 'Udaipur', state: 'Rajasthan', region: 'North', lat: 24.5854, lon: 73.7125 },
  { id: 'in-lucknow', name: 'Lucknow', state: 'Uttar Pradesh', region: 'North', lat: 26.8467, lon: 80.9462 },
  { id: 'in-kanpur', name: 'Kanpur', state: 'Uttar Pradesh', region: 'North', lat: 26.4499, lon: 80.3319 },
  { id: 'in-prayagraj', name: 'Prayagraj', state: 'Uttar Pradesh', region: 'North', lat: 25.4358, lon: 81.8463 },
  { id: 'in-varanasi', name: 'Varanasi', state: 'Uttar Pradesh', region: 'North', lat: 25.3176, lon: 82.9739 },

  // East & Northeast India
  { id: 'in-patna', name: 'Patna', state: 'Bihar', region: 'East', lat: 25.5941, lon: 85.1376 },
  { id: 'in-ranchi', name: 'Ranchi', state: 'Jharkhand', region: 'East', lat: 23.3441, lon: 85.3096 },
  { id: 'in-siliguri', name: 'Siliguri', state: 'West Bengal', region: 'East', lat: 26.7271, lon: 88.3953 },
  { id: 'in-kolkata', name: 'Kolkata', state: 'West Bengal', region: 'East', lat: 22.5726, lon: 88.3639 },
  { id: 'in-bhubaneswar', name: 'Bhubaneswar', state: 'Odisha', region: 'East', lat: 20.2961, lon: 85.8245 },
  { id: 'in-guwahati', name: 'Guwahati', state: 'Assam', region: 'Northeast', lat: 26.1445, lon: 91.7362 },
  { id: 'in-dibrugarh', name: 'Dibrugarh', state: 'Assam', region: 'Northeast', lat: 27.4728, lon: 94.912 },
  { id: 'in-shillong', name: 'Shillong', state: 'Meghalaya', region: 'Northeast', lat: 25.5788, lon: 91.8933 },
  { id: 'in-imphal', name: 'Imphal', state: 'Manipur', region: 'Northeast', lat: 24.817, lon: 93.9368 },
  { id: 'in-agartala', name: 'Agartala', state: 'Tripura', region: 'Northeast', lat: 23.8315, lon: 91.2868 },

  // Central India
  { id: 'in-bhopal', name: 'Bhopal', state: 'Madhya Pradesh', region: 'Central', lat: 23.2599, lon: 77.4126 },
  { id: 'in-indore', name: 'Indore', state: 'Madhya Pradesh', region: 'Central', lat: 22.7196, lon: 75.8577 },
  { id: 'in-jabalpur', name: 'Jabalpur', state: 'Madhya Pradesh', region: 'Central', lat: 23.1815, lon: 79.9864 },
  { id: 'in-raipur', name: 'Raipur', state: 'Chhattisgarh', region: 'Central', lat: 21.2514, lon: 81.6296 },
  { id: 'in-nagpur', name: 'Nagpur', state: 'Maharashtra', region: 'Central', lat: 21.1458, lon: 79.0882 },

  // West India
  { id: 'in-bhuj', name: 'Bhuj', state: 'Gujarat', region: 'West', lat: 23.242, lon: 69.6669 },
  { id: 'in-rajkot', name: 'Rajkot', state: 'Gujarat', region: 'West', lat: 22.3039, lon: 70.8022 },
  { id: 'in-ahmedabad', name: 'Ahmedabad', state: 'Gujarat', region: 'West', lat: 23.0225, lon: 72.5714 },
  { id: 'in-vadodara', name: 'Vadodara', state: 'Gujarat', region: 'West', lat: 22.3072, lon: 73.1812 },
  { id: 'in-surat', name: 'Surat', state: 'Gujarat', region: 'West', lat: 21.1702, lon: 72.8311 },
  { id: 'in-nashik', name: 'Nashik', state: 'Maharashtra', region: 'West', lat: 19.9975, lon: 73.7898 },
  { id: 'in-mumbai', name: 'Mumbai', state: 'Maharashtra', region: 'West', lat: 19.076, lon: 72.8777 },
  { id: 'in-pune', name: 'Pune', state: 'Maharashtra', region: 'West', lat: 18.5204, lon: 73.8567 },
  { id: 'in-panaji', name: 'Panaji', state: 'Goa', region: 'West', lat: 15.4909, lon: 73.8278 },

  // South India & Islands
  { id: 'in-hyderabad', name: 'Hyderabad', state: 'Telangana', region: 'South', lat: 17.385, lon: 78.4867 },
  { id: 'in-visakhapatnam', name: 'Visakhapatnam', state: 'Andhra Pradesh', region: 'South', lat: 17.6868, lon: 83.2185 },
  { id: 'in-vijayawada', name: 'Vijayawada', state: 'Andhra Pradesh', region: 'South', lat: 16.5062, lon: 80.648 },
  { id: 'in-bengaluru', name: 'Bengaluru', state: 'Karnataka', region: 'South', lat: 12.9716, lon: 77.5946 },
  { id: 'in-mangaluru', name: 'Mangaluru', state: 'Karnataka', region: 'South', lat: 12.9141, lon: 74.856 },
  { id: 'in-chennai', name: 'Chennai', state: 'Tamil Nadu', region: 'South', lat: 13.0827, lon: 80.2707 },
  { id: 'in-coimbatore', name: 'Coimbatore', state: 'Tamil Nadu', region: 'South', lat: 11.0168, lon: 76.9558 },
  { id: 'in-madurai', name: 'Madurai', state: 'Tamil Nadu', region: 'South', lat: 9.9252, lon: 78.1198 },
  { id: 'in-kochi', name: 'Kochi', state: 'Kerala', region: 'South', lat: 9.9312, lon: 76.2673 },
  { id: 'in-thiruvananthapuram', name: 'Thiruvananthapuram', state: 'Kerala', region: 'South', lat: 8.5241, lon: 76.9366 },
  { id: 'in-portblair', name: 'Port Blair', state: 'Andaman & Nicobar', region: 'Islands', lat: 11.6234, lon: 92.7265 },
];

export const INDIA_MAP_CENTER = { lat: 22.3511, lng: 78.6677 };
export const INDIA_MAP_BOUNDS = {
  north: 35.5,
  south: 7.2,
  east: 97.4,
  west: 68.1,
};
