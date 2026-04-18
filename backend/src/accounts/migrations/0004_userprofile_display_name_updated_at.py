from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0003_gamification'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='display_name_updated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
