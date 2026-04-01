import React, { useState } from 'react';
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

export default function TermsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Terms & Conditions</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.lastUpdated}>Last Updated: February 15, 2026</Text>
        
        <Text style={styles.introText}>
          Welcome to POPNOW. By creating an account or using our services, you agree to be bound by these Terms and Conditions. Please read them carefully.
        </Text>

        {/* Section 1 */}
        <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
        <Text style={styles.paragraph}>
          By accessing or using POPNOW, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions and our Privacy Policy. If you do not agree, you may not use our services.
        </Text>

        {/* Section 2 */}
        <Text style={styles.sectionTitle}>2. Platform Role and User Responsibility</Text>
        
        <Text style={styles.subTitle}>2.1 Platform Nature</Text>
        <Text style={styles.paragraph}>
          POPNOW is a technology platform that enables users to create, share, and discover short-form video content based on geographic location. POPNOW acts solely as an intermediary platform and does not create, upload, or control user-generated content.
        </Text>

        <Text style={styles.subTitle}>2.2 User Content Responsibility</Text>
        <Text style={styles.bulletPoint}>• YOU ARE SOLELY RESPONSIBLE for all videos, images, text, and other content you upload, post, or share on POPNOW.</Text>
        <Text style={styles.bulletPoint}>• POPNOW is NOT responsible for user-generated content, user behavior, or any consequences arising from content you or others publish on the platform.</Text>
        <Text style={styles.bulletPoint}>• You represent and warrant that you own all rights to the content you upload or have obtained all necessary permissions and licenses.</Text>

        <Text style={styles.subTitle}>2.3 Legal Compliance</Text>
        <Text style={styles.paragraph}>
          You agree to comply with all applicable local, national, and international laws when using POPNOW. You will NOT upload content that:
        </Text>
        <Text style={styles.bulletPoint}>• Violates any laws or regulations</Text>
        <Text style={styles.bulletPoint}>• Infringes on intellectual property rights</Text>
        <Text style={styles.bulletPoint}>• Contains hate speech, harassment, or threats</Text>
        <Text style={styles.bulletPoint}>• Depicts violence, illegal activities, or exploitation</Text>
        <Text style={styles.bulletPoint}>• Contains nudity, sexual content, or adult material</Text>
        <Text style={styles.bulletPoint}>• Invades privacy or discloses personal information of others without consent</Text>
        <Text style={styles.bulletPoint}>• Is misleading, fraudulent, or deceptive</Text>

        <Text style={styles.subTitle}>2.4 Legal Consequences</Text>
        <Text style={styles.warningText}>
          YOU MAY FACE CRIMINAL OR CIVIL LIABILITY if you upload unlawful content or use POPNOW for illegal purposes.
        </Text>
        <Text style={styles.paragraph}>
          POPNOW will cooperate fully with law enforcement agencies and may be required to disclose your information in response to legal requests. You agree to indemnify and hold POPNOW harmless from any claims, damages, or legal actions arising from your content or use of the platform.
        </Text>

        {/* Section 3 */}
        <Text style={styles.sectionTitle}>3. Location Privacy and Risks</Text>
        
        <Text style={styles.subTitle}>3.1 Location Disclosure Options</Text>
        <Text style={styles.paragraph}>POPNOW provides three location privacy settings for your videos:</Text>
        <Text style={styles.bulletPoint}>• Exact Location: Shows your precise GPS coordinates</Text>
        <Text style={styles.bulletPoint}>• 3km Radius: Displays a random point within 3 kilometers of your actual location</Text>
        <Text style={styles.bulletPoint}>• 10km Radius: Displays a random point within 10 kilometers of your actual location</Text>

        <Text style={styles.subTitle}>3.2 Privacy Risks</Text>
        <Text style={styles.warningText}>
          YOU ACKNOWLEDGE that choosing "Exact Location" may expose your precise whereabouts to other users.
        </Text>
        <Text style={styles.paragraph}>Sharing your exact location may reveal:</Text>
        <Text style={styles.bulletPoint}>• Your home address</Text>
        <Text style={styles.bulletPoint}>• Your workplace</Text>
        <Text style={styles.bulletPoint}>• Your daily routines and patterns</Text>
        <Text style={styles.bulletPoint}>• Other sensitive location information</Text>
        <Text style={styles.warningText}>
          POPNOW IS NOT RESPONSIBLE for any privacy breaches, security incidents, stalking, harassment, physical harm, or other consequences resulting from your choice to share location information.
        </Text>

        {/* Section 4 */}
        <Text style={styles.sectionTitle}>4. Content Moderation</Text>
        
        <Text style={styles.subTitle}>4.1 AI Moderation System</Text>
        <Text style={styles.paragraph}>
          All uploaded content is automatically screened using Amazon Web Services (AWS) AI moderation technology. The AI system analyzes videos for prohibited content including violence, nudity, explicit material, and other policy violations.
        </Text>

        <Text style={styles.subTitle}>4.2 AI Limitations</Text>
        <Text style={styles.warningText}>
          YOU ACKNOWLEDGE that AI moderation is not perfect and may fail to detect some inappropriate content or incorrectly flag appropriate content.
        </Text>
        <Text style={styles.warningText}>
          POPNOW IS NOT LIABLE for any inappropriate content that bypasses AI moderation or any harm caused by such content.
        </Text>

        <Text style={styles.subTitle}>4.3 POPNOW's Rights</Text>
        <Text style={styles.paragraph}>POPNOW reserves the right to:</Text>
        <Text style={styles.bulletPoint}>• Remove any content at any time without notice or explanation</Text>
        <Text style={styles.bulletPoint}>• Delete videos that violate these Terms, even if they passed AI moderation</Text>
        <Text style={styles.bulletPoint}>• Suspend or terminate accounts for repeated or severe violations</Text>
        <Text style={styles.bulletPoint}>• Report illegal content to appropriate authorities</Text>

        {/* Section 5 */}
        <Text style={styles.sectionTitle}>5. Video Expiration and Deletion</Text>
        <Text style={styles.paragraph}>
          Videos expire automatically 72 hours (3 days) after upload. Expired videos are permanently deleted and CANNOT be recovered. POPNOW is not responsible for preserving your content beyond the expiration period.
        </Text>

        {/* 🆕 Section 6: Premium Subscription */}
        <Text style={styles.sectionTitle}>6. Premium Subscription</Text>
        
        <Text style={styles.subTitle}>6.1 Subscription Details</Text>
        <Text style={styles.paragraph}>
          POPNOW Premium is an optional paid subscription available for $4.99 USD per month (price may vary by region and currency). Premium membership includes:
        </Text>
        <Text style={styles.bulletPoint}>• 1,000 POPCoins instantly upon subscription</Text>
        <Text style={styles.bulletPoint}>• No watermarks on uploaded videos</Text>
        <Text style={styles.bulletPoint}>• Golden avatar ring</Text>
        <Text style={styles.bulletPoint}>• Unlimited video requests</Text>
        <Text style={styles.bulletPoint}>• Unlimited video uploads</Text>
        <Text style={styles.bulletPoint}>• Ad-free experience</Text>

        <Text style={styles.subTitle}>6.2 Auto-Renewal</Text>
        <Text style={styles.warningText}>
          Premium subscriptions automatically renew each month unless cancelled at least 24 hours before the end of the current billing period.
        </Text>
        <Text style={styles.paragraph}>
          Payment will be charged to your Apple App Store or Google Play Store account at confirmation of purchase. Your subscription will automatically renew unless auto-renew is turned off at least 24 hours before the end of the current period. You can manage your subscription and turn off auto-renewal in your device's Account Settings after purchase.
        </Text>

        <Text style={styles.subTitle}>6.3 Managed by Apple/Google</Text>
        <Text style={styles.paragraph}>
          Premium subscriptions are processed and managed entirely by Apple (for iOS users) or Google (for Android users). POPNOW does NOT process payments, store payment information, or handle subscription billing.
        </Text>
        <Text style={styles.bulletPoint}>• All payments are processed through your Apple ID or Google Play account</Text>
        <Text style={styles.bulletPoint}>• Subscription management is done through your device settings (App Store or Play Store)</Text>
        <Text style={styles.bulletPoint}>• Billing disputes must be directed to Apple or Google</Text>

        <Text style={styles.subTitle}>6.4 Cancellation Policy</Text>
        <Text style={styles.paragraph}>
          You may cancel your Premium subscription at any time through your device's App Store or Play Store settings. Upon cancellation:
        </Text>
        <Text style={styles.bulletPoint}>• You will retain Premium benefits until the end of your current billing period</Text>
        <Text style={styles.bulletPoint}>• No refunds will be provided for partial months</Text>
        <Text style={styles.bulletPoint}>• Your account will revert to Free status at the end of the billing period</Text>
        <Text style={styles.bulletPoint}>• POPCoins awarded with Premium will NOT be removed</Text>

        {/* 🆕 Section 7: Coin Economy */}
        <Text style={styles.sectionTitle}>7. POPCoins Virtual Currency</Text>
        
        <Text style={styles.subTitle}>7.1 Nature of POPCoins</Text>
        <Text style={styles.warningText}>
          POPCoins are a virtual in-app currency with NO CASH VALUE. POPCoins CANNOT be withdrawn, transferred to other users, exchanged for real money, or refunded for cash under any circumstances.
        </Text>

        <Text style={styles.subTitle}>7.2 Earning POPCoins</Text>
        <Text style={styles.paragraph}>Users can earn POPCoins through:</Text>
        <Text style={styles.bulletPoint}>• Daily Login Bonus: 50 POPCoins per day (claimed once every 24 hours)</Text>
        <Text style={styles.bulletPoint}>• Winning Video Requests: 100 POPCoins when your video is selected as the winner</Text>
        <Text style={styles.bulletPoint}>• Premium Subscription: 1,000 POPCoins instantly upon subscribing or renewing</Text>

        <Text style={styles.subTitle}>7.3 Spending POPCoins</Text>
        <Text style={styles.paragraph}>
          POPCoins are spent when creating video requests. Each video request costs 100 POPCoins. If your request expires without any fulfillments, you will receive a 100 POPCoin refund.
        </Text>

        <Text style={styles.subTitle}>7.4 POPNOW's Rights</Text>
        <Text style={styles.paragraph}>
          POPNOW reserves the right to:
        </Text>
        <Text style={styles.bulletPoint}>• Adjust, add, or remove POPCoins from user accounts for fraud prevention, abuse, or violation of these Terms</Text>
        <Text style={styles.bulletPoint}>• Modify the POPCoin economy, including earning and spending rates, at any time without notice</Text>
        <Text style={styles.bulletPoint}>• Terminate the POPCoin system entirely at its sole discretion</Text>
        <Text style={styles.bulletPoint}>• Remove all POPCoins upon account termination with no compensation</Text>

        {/* 🆕 Section 8: Advertisements */}
        <Text style={styles.sectionTitle}>8. Advertisements</Text>
        
        <Text style={styles.subTitle}>8.1 Ad Display</Text>
        <Text style={styles.paragraph}>
          Free users will see advertisements while using POPNOW. Ads are displayed approximately once every 10 videos viewed. Premium subscribers enjoy an ad-free experience.
        </Text>

        <Text style={styles.subTitle}>8.2 Ad Provider</Text>
        <Text style={styles.paragraph}>
          Advertisements are provided and controlled by Google AdMob. POPNOW does NOT select, create, or control the specific ads displayed to users.
        </Text>

        <Text style={styles.subTitle}>8.3 Ad Content Disclaimer</Text>
        <Text style={styles.warningText}>
          POPNOW IS NOT RESPONSIBLE for the content, accuracy, or appropriateness of advertisements displayed through Google AdMob.
        </Text>
        <Text style={styles.paragraph}>
          While we use Google's ad filtering systems, we cannot guarantee that all ads will be appropriate or accurate. If you encounter objectionable advertising, please report it directly to Google AdMob.
        </Text>

        <Text style={styles.subTitle}>8.4 Ad Tracking</Text>
        <Text style={styles.paragraph}>
          Google AdMob may collect data about your device and usage patterns to serve personalized advertisements. You can control ad personalization through your device's privacy settings. For more information, see our Privacy Policy.
        </Text>

        {/* 🆕 Section 9: Refund Policy */}
        <Text style={styles.sectionTitle}>9. Refund Policy</Text>
        
        <Text style={styles.subTitle}>9.1 Video Request Refunds</Text>
        <Text style={styles.paragraph}>
          If you create a video request (100 POPCoins) and it expires without receiving any fulfillment videos, you will automatically receive a full 100 POPCoin refund. No action is required on your part.
        </Text>

        <Text style={styles.subTitle}>9.2 Premium Subscription Refunds</Text>
        <Text style={styles.paragraph}>
          Premium subscription refunds are managed entirely by Apple (iOS) or Google (Android) according to their respective refund policies. POPNOW does NOT process refunds for Premium subscriptions.
        </Text>
        <Text style={styles.bulletPoint}>• iOS users: Request refunds through the App Store (reportaproblem.apple.com)</Text>
        <Text style={styles.bulletPoint}>• Android users: Request refunds through Google Play Store</Text>
        <Text style={styles.bulletPoint}>• Refund eligibility is determined solely by Apple or Google</Text>

        <Text style={styles.subTitle}>9.3 POPCoins - No Cash Refunds</Text>
        <Text style={styles.warningText}>
          POPCoins CANNOT be refunded for cash under any circumstances, including account termination, suspension, or dissatisfaction with the service.
        </Text>

        {/* Section 10 (formerly 6) */}
        <Text style={styles.sectionTitle}>10. Disclaimers and Limitation of Liability</Text>
        <Text style={styles.warningText}>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW: POPNOW IS NOT LIABLE for any damages arising from your use of the platform, user-generated content, privacy breaches, location disclosure, account suspension, service interruptions, loss of POPCoins, Premium subscription issues, advertisement content, or any other use of POPNOW.
        </Text>
        <Text style={styles.paragraph}>
          The service is provided "AS IS" without warranties of any kind. POPNOW does not guarantee uninterrupted access, error-free operation, or preservation of content or POPCoins.
        </Text>

        {/* Contact */}
        <Text style={styles.sectionTitle}>Contact</Text>
        <Text style={styles.paragraph}>
          For questions about these Terms, contact us at: support@popnow.world
        </Text>

        <Text style={styles.finalNote}>
          By creating an account or using POPNOW, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions.
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