import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { router } from 'expo-router';

export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.lastUpdated}>Last Updated: March 1, 2026</Text>
        
        <Text style={styles.introText}>
          POPNOW ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, share, and protect your personal information when you use the POPNOW mobile application.
        </Text>

        {/* Section 1 */}
        <Text style={styles.sectionTitle}>1. Information We Collect</Text>
        
        <Text style={styles.subTitle}>1.1 Information You Provide</Text>
        <Text style={styles.bulletPoint}>• Account Information: Username, email address, password, profile picture, display name, bio, location</Text>
        <Text style={styles.bulletPoint}>• Content: Videos, captions, hashtags, comments, and other user-generated content</Text>
        <Text style={styles.bulletPoint}>• Communications: Messages you send to us or other users</Text>
        <Text style={styles.bulletPoint}>• Block List: Records of users you have blocked</Text>

        <Text style={styles.subTitle}>1.2 Automatically Collected Information</Text>
        <Text style={styles.bulletPoint}>• Device Information: Device type, operating system, unique device identifiers, mobile network information</Text>
        <Text style={styles.bulletPoint}>• Location Data: GPS coordinates, IP address-based location (only when you actively upload a video, with your permission)</Text>
        <Text style={styles.bulletPoint}>• Usage Data: Videos viewed, searches performed, interactions with content, time spent in app</Text>
        <Text style={styles.bulletPoint}>• Camera & Microphone: Access to record videos (only when you actively use the camera feature)</Text>

        <Text style={styles.subTitle}>1.3 Third-Party Services Data</Text>
        <Text style={styles.bulletPoint}>• RevenueCat User ID: Anonymous identifier for managing Premium subscriptions</Text>
        <Text style={styles.bulletPoint}>• Google AdMob: Device identifiers and usage patterns for serving advertisements</Text>
        <Text style={styles.bulletPoint}>• Amazon Web Services (AWS): Video files and metadata for storage and AI moderation</Text>

        {/* Section 2 */}
        <Text style={styles.sectionTitle}>2. How We Use Your Information</Text>
        
        <Text style={styles.paragraph}>We use your information to:</Text>
        <Text style={styles.bulletPoint}>• Provide and improve POPNOW services</Text>
        <Text style={styles.bulletPoint}>• Create and manage your account</Text>
        <Text style={styles.bulletPoint}>• Display location-based video content</Text>
        <Text style={styles.bulletPoint}>• Process video uploads and moderate content using AI</Text>
        <Text style={styles.bulletPoint}>• Manage POPCoins virtual currency and transactions</Text>
        <Text style={styles.bulletPoint}>• Process Premium subscriptions through Apple and Google</Text>
        <Text style={styles.bulletPoint}>• Send push notifications about app activity</Text>
        <Text style={styles.bulletPoint}>• Display personalized advertisements (free users only)</Text>
        <Text style={styles.bulletPoint}>• Enforce user blocks and content filtering</Text>
        <Text style={styles.bulletPoint}>• Detect and prevent fraud, abuse, and violations of our Terms</Text>
        <Text style={styles.bulletPoint}>• Comply with legal obligations and law enforcement requests</Text>

        {/* Section 3 */}
        <Text style={styles.sectionTitle}>3. How We Share Your Information</Text>
        
        <Text style={styles.subTitle}>3.1 Public Information</Text>
        <Text style={styles.paragraph}>
          The following information is PUBLIC and visible to all POPNOW users, except those you have blocked:
        </Text>
        <Text style={styles.bulletPoint}>• Your username, display name, profile picture, and bio</Text>
        <Text style={styles.bulletPoint}>• Videos you upload and their locations (subject to your privacy settings)</Text>
        <Text style={styles.bulletPoint}>• Comments, likes, and other public interactions</Text>
        <Text style={styles.bulletPoint}>• Your follower and following counts</Text>

        <Text style={styles.subTitle}>3.2 Service Providers</Text>
        <Text style={styles.paragraph}>We share data with third-party service providers:</Text>
        <Text style={styles.bulletPoint}>• Supabase: Database hosting and authentication</Text>
        <Text style={styles.bulletPoint}>• Bunny.net: Video hosting and streaming</Text>
        <Text style={styles.bulletPoint}>• Amazon Web Services (AWS): AI content moderation</Text>
        <Text style={styles.bulletPoint}>• RevenueCat: Premium subscription management</Text>
        <Text style={styles.bulletPoint}>• Apple & Google: In-app purchase processing</Text>
        <Text style={styles.bulletPoint}>• Google AdMob: Advertisement delivery</Text>

        <Text style={styles.subTitle}>3.3 Legal Requirements</Text>
        <Text style={styles.paragraph}>
          We may disclose your information if required by law, court order, or government request, or to protect our rights, property, or safety.
        </Text>

        <Text style={styles.subTitle}>3.4 Business Transfers</Text>
        <Text style={styles.paragraph}>
          If POPNOW is acquired or merged with another company, your information may be transferred to the new owner.
        </Text>

        {/* Section 4 */}
        <Text style={styles.sectionTitle}>4. Location Privacy</Text>
        
        <Text style={styles.paragraph}>
          Location permission is required to upload videos and fulfill video requests. Location data is only collected at the moment you actively upload a video — there is no automatic or continuous location tracking.
        </Text>

        <Text style={styles.paragraph}>
          Users who decline location access can still browse, watch, like, comment, follow other users, and create video requests. Only uploading videos and fulfilling requests require location permission.
        </Text>

        <Text style={styles.paragraph}>
          When uploading, you control location precision through three settings:
        </Text>
        <Text style={styles.bulletPoint}>• Exact Location: Shows precise GPS coordinates</Text>
        <Text style={styles.bulletPoint}>• 3km Radius: Shows randomized location within 3km</Text>
        <Text style={styles.bulletPoint}>• 10km Radius: Shows randomized location within 10km</Text>

        <Text style={styles.paragraph}>
          Our map displays video locations, not live user locations. Each video upload is a one-time manual action, and videos are automatically deleted after 3 days.
        </Text>

        <Text style={styles.warningText}>
          WARNING: Choosing "Exact Location" may reveal your home, workplace, or other sensitive locations. We recommend using 3km or 10km radius for privacy protection.
        </Text>

        {/* Section 5 */}
        <Text style={styles.sectionTitle}>5. Advertising and Tracking</Text>
        
        <Text style={styles.subTitle}>5.1 Google AdMob</Text>
        <Text style={styles.paragraph}>
          Free users see advertisements powered by Google AdMob. AdMob may collect:
        </Text>
        <Text style={styles.bulletPoint}>• Device identifiers (IDFA on iOS, Advertising ID on Android)</Text>
        <Text style={styles.bulletPoint}>• IP address and general location</Text>
        <Text style={styles.bulletPoint}>• App usage patterns and interactions with ads</Text>

        <Text style={styles.subTitle}>5.2 Controlling Ad Tracking</Text>
        <Text style={styles.paragraph}>You can limit ad tracking:</Text>
        <Text style={styles.bulletPoint}>• iOS: Settings → Privacy & Security → Tracking → Limit Ad Tracking</Text>
        <Text style={styles.bulletPoint}>• Android: Settings → Google → Ads → Opt out of Ads Personalization</Text>

        <Text style={styles.subTitle}>5.3 Premium Users</Text>
        <Text style={styles.paragraph}>
          Premium subscribers do not see advertisements and are not subject to ad tracking by Google AdMob.
        </Text>

        {/* Section 6 */}
        <Text style={styles.sectionTitle}>6. Data Retention</Text>
        
        <Text style={styles.bulletPoint}>• Videos: Automatically deleted 72 hours (3 days) after upload</Text>
        <Text style={styles.bulletPoint}>• Account Data: Retained until you delete your account</Text>
        <Text style={styles.bulletPoint}>• POPCoins Transactions: Retained for fraud prevention and auditing purposes</Text>
        <Text style={styles.bulletPoint}>• Analytics Data: Aggregated and anonymized after 90 days</Text>

        {/* Section 7 */}
        <Text style={styles.sectionTitle}>7. Your Rights and Choices</Text>
        
        <Text style={styles.subTitle}>7.1 Access and Update</Text>
        <Text style={styles.paragraph}>
          You can access and update your profile information at any time through the app's Settings page.
        </Text>

        <Text style={styles.subTitle}>7.2 Delete Your Account</Text>
        <Text style={styles.paragraph}>
          You can request account deletion by contacting us at support@popnow.world. Upon deletion:
        </Text>
        <Text style={styles.bulletPoint}>• All your videos will be permanently deleted</Text>
        <Text style={styles.bulletPoint}>• Your profile information will be removed</Text>
        <Text style={styles.bulletPoint}>• POPCoins will be forfeited with no refund</Text>
        <Text style={styles.bulletPoint}>• Some data may be retained for legal compliance (e.g., transaction records)</Text>

        <Text style={styles.subTitle}>7.3 Location Permissions</Text>
        <Text style={styles.paragraph}>
          You can revoke location access through your device settings at any time. Without location access, you can still browse, watch, like, comment, follow users, and create video requests. Uploading videos and fulfilling requests require location permission.
        </Text>

        <Text style={styles.subTitle}>7.4 Push Notifications</Text>
        <Text style={styles.paragraph}>
          You can disable push notifications in your device settings or within the POPNOW app settings.
        </Text>

        <Text style={styles.subTitle}>7.5 Blocking Users</Text>
        <Text style={styles.paragraph}>
          You can block other users through their profile page. Blocked users will not be able to view your content or interact with you, and their content will be hidden from your feed, map, comments, and search results. You can manage your block list in the app's Settings page.
        </Text>

        {/* Section 8 */}
        <Text style={styles.sectionTitle}>8. Children's Privacy</Text>
        
        <Text style={styles.paragraph}>
          POPNOW is NOT intended for users under the age of 13 (or 16 in the European Union). We do not knowingly collect personal information from children. If we discover that a child has provided us with personal information, we will delete it immediately.
        </Text>

        {/* Section 9 */}
        <Text style={styles.sectionTitle}>9. International Data Transfers</Text>
        
        <Text style={styles.paragraph}>
          Your information may be transferred to and processed in countries other than your own. These countries may have different data protection laws. By using POPNOW, you consent to such transfers.
        </Text>

        {/* Section 10 */}
        <Text style={styles.sectionTitle}>10. Data Security</Text>
        
        <Text style={styles.paragraph}>
          We implement industry-standard security measures to protect your information, including:
        </Text>
        <Text style={styles.bulletPoint}>• Encryption of data in transit (HTTPS/TLS)</Text>
        <Text style={styles.bulletPoint}>• Secure cloud storage with access controls</Text>
        <Text style={styles.bulletPoint}>• AI content moderation to prevent harmful content</Text>

        <Text style={styles.warningText}>
          However, no system is 100% secure. We cannot guarantee absolute security of your data.
        </Text>

        {/* Section 11 */}
        <Text style={styles.sectionTitle}>11. Changes to This Privacy Policy</Text>
        
        <Text style={styles.paragraph}>
          We may update this Privacy Policy from time to time. We will notify you of significant changes by posting a notice in the app or sending you a notification. Your continued use of POPNOW after changes constitutes acceptance of the updated Privacy Policy.
        </Text>

        {/* Section 12 */}
        <Text style={styles.sectionTitle}>12. Contact Us</Text>
        
        <Text style={styles.paragraph}>
          If you have questions about this Privacy Policy or wish to exercise your data rights, contact us at:
        </Text>
        <Text style={styles.paragraph}>
          Email: support@popnow.world
        </Text>

        <Text style={styles.finalNote}>
          By using POPNOW, you acknowledge that you have read and understood this Privacy Policy.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  lastUpdated: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  introText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 24,
    marginBottom: 12,
  },
  subTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
    marginBottom: 12,
  },
  bulletPoint: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
    marginBottom: 6,
    paddingLeft: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#FF3B30',
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 12,
  },
  finalNote: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
    lineHeight: 22,
    marginTop: 24,
    marginBottom: 20,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});