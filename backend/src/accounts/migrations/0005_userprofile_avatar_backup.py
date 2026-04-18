from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0004_userprofile_display_name_updated_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='avatar_backup',
            field=models.ImageField(blank=True, null=True, upload_to='avatars/'),
        ),
    ]
